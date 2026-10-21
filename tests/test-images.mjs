import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { crc32, deflateSync } from 'node:zlib';
import sharp from 'sharp';
import { optimizeImages } from '../scripts/optimize-images.mjs';

async function fixture(t) {
	const root = await mkdtemp(path.join(os.tmpdir(), 'gitblog-images-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(path.join(root, 'build/uploads'), { recursive: true });
	return root;
}

const image = (width = 2000, height = 1000) =>
	sharp({
		create: { width, height, channels: 4, background: { r: 160, g: 90, b: 20, alpha: 0.5 } }
	});
const run = (root) => optimizeImages({ root, log: () => {} });

function animatedPng() {
	const chunk = (type, data) => {
		const header = Buffer.alloc(8);
		header.writeUInt32BE(data.length);
		header.write(type, 4);
		const checksum = Buffer.alloc(4);
		checksum.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), data])));
		return Buffer.concat([header, data, checksum]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(1700, 0);
	header.writeUInt32BE(1, 4);
	header[8] = 8;
	header[9] = 6;
	const animation = Buffer.alloc(8);
	animation.writeUInt32BE(2);
	const control = (sequence) => {
		const data = Buffer.alloc(26);
		data.writeUInt32BE(sequence, 0);
		data.writeUInt32BE(1700, 4);
		data.writeUInt32BE(1, 8);
		data.writeUInt16BE(1, 20);
		data.writeUInt16BE(10, 22);
		return chunk('fcTL', data);
	};
	const scanline = (color) =>
		deflateSync(Buffer.concat([Buffer.from([0]), Buffer.alloc(1700 * 4, color)]));
	return Buffer.concat([
		Buffer.from('89504e470d0a1a0a', 'hex'),
		chunk('IHDR', header),
		chunk('acTL', animation),
		control(0),
		chunk('IDAT', scanline(0)),
		control(1),
		chunk('fdAT', Buffer.concat([Buffer.from([0, 0, 0, 2]), scanline(255)])),
		chunk('IEND', Buffer.alloc(0))
	]);
}

test('same-format optimization preserves paths, transparency, and originals; repeated builds reuse bytes', async (t) => {
	const root = await fixture(t);
	await mkdir(path.join(root, 'static/uploads'), { recursive: true });
	for (const format of ['jpeg', 'png', 'webp', 'avif']) {
		const input = await image()
			[format](format === 'png' ? { compressionLevel: 0 } : { quality: 100 })
			.toBuffer();
		await writeFile(path.join(root, `static/uploads/photo.${format}`), input);
		await writeFile(path.join(root, `build/uploads/photo.${format}`), input);
	}
	assert.equal((await run(root)).optimized, 4);
	const optimized = new Map();
	for (const format of ['jpeg', 'png', 'webp', 'avif']) {
		const output = await readFile(path.join(root, `build/uploads/photo.${format}`));
		const source = await readFile(path.join(root, `static/uploads/photo.${format}`));
		const meta = await sharp(output).metadata();
		assert.equal(meta.width, 1600);
		assert.equal(meta.height, 800);
		assert.equal(meta.format, format === 'avif' ? 'heif' : format);
		assert.ok(output.length < source.length);
		assert.equal((await sharp(source).metadata()).width, 2000);
		if (format !== 'jpeg') assert.equal(meta.hasAlpha, true);
		optimized.set(format, output);
	}
	assert.equal((await run(root)).optimized, 0);
	for (const [format, output] of optimized) {
		assert.deepEqual(await readFile(path.join(root, `build/uploads/photo.${format}`)), output);
		await writeFile(
			path.join(root, `build/uploads/photo.${format}`),
			await readFile(path.join(root, `static/uploads/photo.${format}`))
		);
	}
	const rebuilt = await run(root);
	assert.equal(rebuilt.reused, 4);
	assert.equal(rebuilt.optimized, 0);
	for (const [format, output] of optimized)
		assert.deepEqual(await readFile(path.join(root, `build/uploads/photo.${format}`)), output);
});

test('CMS budgets skip encoding, cover/blog limits apply, and EXIF orientation is applied', async (t) => {
	const root = await fixture(t);
	for (const folder of ['posts', 'covers', 'blog'])
		await mkdir(path.join(root, 'build/uploads', folder));
	const cms = await image(1600, 900).webp({ quality: 80 }).toBuffer();
	await writeFile(path.join(root, 'build/uploads/posts/cms.webp'), cms);
	const original = await image(2000, 1000)
		.jpeg({ quality: 100 })
		.withMetadata({ orientation: 6 })
		.toBuffer();
	for (const folder of ['covers', 'blog'])
		await writeFile(path.join(root, `build/uploads/${folder}/photo.jpg`), original);
	const stats = await run(root);
	assert.equal(stats.skipped, 1);
	assert.equal(stats.optimized, 2);
	assert.deepEqual(await readFile(path.join(root, 'build/uploads/posts/cms.webp')), cms);
	for (const [folder, size] of [
		['covers', 960],
		['blog', 384]
	]) {
		const metadata = await sharp(path.join(root, `build/uploads/${folder}/photo.jpg`)).metadata();
		assert.equal(metadata.height, size);
		assert.equal(metadata.width, size / 2);
		assert.equal(metadata.orientation, undefined);
	}
});

test('cache corruption and replacement at the same URL do not serve stale images; deleted assets are pruned', async (t) => {
	const root = await fixture(t);
	const target = path.join(root, 'build/uploads/photo.png');
	const input = await image().png().toBuffer();
	await writeFile(target, input);
	await run(root);
	const cache = path.join(root, '.cache/gitblog-images');
	const index = JSON.parse(await readFile(path.join(cache, 'index.json')));
	await writeFile(path.join(cache, `${index.entries[0].output}.bin`), 'broken');
	await writeFile(target, input);
	assert.equal((await run(root)).optimized, 1);
	const replacement = await image(2000, 600).png().toBuffer();
	await writeFile(target, replacement);
	assert.equal((await run(root)).optimized, 1);
	assert.equal((await sharp(target).metadata()).height, 480);
	assert.equal((await readdir(cache)).filter((file) => file.endsWith('.bin')).length, 1);
	await rm(target);
	await run(root);
	assert.deepEqual(await readdir(cache), ['index.json']);
});

test('animated, vector, corrupt and symlinked assets remain unchanged', async (t) => {
	const root = await fixture(t);
	// Two vertically stacked frames with different colors.
	const frames = Buffer.concat([Buffer.alloc(1700 * 3, 0), Buffer.alloc(1700 * 3, 255)]);
	const animated = await sharp(frames, {
		raw: { width: 1700, height: 2, channels: 3, pageHeight: 1 }
	})
		.webp({ loop: 0, delay: [100, 100] })
		.toBuffer();
	assert.equal((await sharp(animated).metadata()).pages, 2);
	const assets = {
		'animation.webp': animated,
		'animation.png': animatedPng(),
		'vector.svg': Buffer.from('<svg/>'),
		'broken.jpg': Buffer.from('not an image'),
		'animation.gif': Buffer.from('GIF89a')
	};
	for (const [name, bytes] of Object.entries(assets))
		await writeFile(path.join(root, 'build/uploads', name), bytes);
	const outside = path.join(root, 'outside.jpg');
	const original = await image().jpeg().toBuffer();
	await writeFile(outside, original);
	await symlink(outside, path.join(root, 'build/uploads/link.jpg'));
	const stats = await run(root);
	assert.equal(stats.optimized, 0);
	assert.equal(stats.warnings, 1);
	for (const [name, bytes] of Object.entries(assets))
		assert.deepEqual(await readFile(path.join(root, 'build/uploads', name)), bytes);
	assert.deepEqual(await readFile(outside), original);
});

test('an empty blog builds without uploads or an image cache', async (t) => {
	const root = await fixture(t);
	await rm(path.join(root, 'build/uploads'), { recursive: true });
	assert.equal((await run(root)).optimized, 0);
	await assert.rejects(readdir(path.join(root, '.cache')), { code: 'ENOENT' });
});

test('optimized images above the skip budget are recognized by hash, and no conversion increases size', async (t) => {
	const root = await fixture(t);
	let state = 42;
	const pixels = Buffer.alloc(600 * 600 * 3);
	for (let i = 0; i < pixels.length; i++) {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		pixels[i] = i % 3 === 2 ? 0 : state >>> 24;
	}
	const noisy = await sharp(pixels, { raw: { width: 600, height: 600, channels: 3 } })
		.png({ compressionLevel: 0 })
		.toBuffer();
	const target = path.join(root, 'build/uploads/noisy.png');
	await writeFile(target, noisy);
	assert.equal((await run(root)).optimized, 1);
	const encoded = await readFile(target);
	assert.ok(encoded.length > 500 * 1024);
	assert.equal((await run(root)).optimized, 0);
	assert.deepEqual(await readFile(target), encoded);
	const palette = await image().png({ palette: true }).toBuffer();
	const small = path.join(root, 'build/uploads/palette.png');
	await writeFile(small, palette);
	await run(root);
	assert.deepEqual(await readFile(small), palette);
});
