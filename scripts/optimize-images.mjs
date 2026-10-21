import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Changing these settings invalidates cached encodings, including across CI runs.
const policy = `v1:${sharp.versions.sharp}:${sharp.versions.vips}`;
const maxInputBytes = 50 * 1024 * 1024;
const inputOptions = { limitInputPixels: 64 * 1024 * 1024 };
const formats = new Map([
	['.jpg', 'jpeg'],
	['.jpeg', 'jpeg'],
	['.png', 'png'],
	['.webp', 'webp'],
	['.avif', 'heif']
]);
const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');
const validHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

// libvips can expose only the first APNG frame, so inspect its animation control chunk.
function isAnimatedPng(buffer) {
	if (buffer.length < 8 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
		return false;
	for (let offset = 8; offset + 12 <= buffer.length; ) {
		const length = buffer.readUInt32BE(offset);
		if (offset + length + 12 > buffer.length) return false;
		if (buffer.toString('ascii', offset + 4, offset + 8) === 'acTL') return true;
		offset += length + 12;
	}
	return false;
}

function profileFor(relativePath) {
	const folder = relativePath.split('/')[0];
	if (folder === 'covers') return { size: 960, bytes: 250 * 1024 };
	if (folder === 'blog') return { size: 384, bytes: 100 * 1024 };
	return { size: 1600, bytes: 500 * 1024 };
}

async function regularFile(file) {
	try {
		return (await lstat(file)).isFile();
	} catch (error) {
		if (error.code === 'ENOENT') return false;
		throw error;
	}
}

async function* walk(directory, prefix = '') {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) yield* walk(path.join(directory, entry.name), relative);
		else if (entry.isFile()) yield relative;
		// Do not follow user-provided symlinks outside the build output.
	}
}

/** Optimize only generated Pages assets. Source uploads and their URLs stay unchanged. */
export async function optimizeImages({ root = process.cwd(), log = console.log } = {}) {
	const directory = path.join(root, 'build/uploads');
	const cache = path.join(root, '.cache/gitblog-images');
	const stats = { optimized: 0, reused: 0, skipped: 0, warnings: 0, savedBytes: 0 };
	for (const folder of [path.join(root, 'build'), directory]) {
		try {
			if (!(await lstat(folder)).isDirectory()) return stats;
		} catch (error) {
			if (error.code === 'ENOENT') return stats;
			throw error;
		}
	}
	for (const folder of [path.dirname(cache), cache]) {
		await mkdir(folder, { recursive: true });
		if (!(await lstat(folder)).isDirectory()) throw new Error(`Unsafe cache directory: ${folder}`);
	}
	const indexFile = path.join(cache, 'index.json');
	let previous = [];
	if (await regularFile(indexFile)) {
		try {
			const index = JSON.parse(await readFile(indexFile, 'utf8'));
			if (index?.policy === policy && Array.isArray(index.entries)) {
				previous = index.entries.filter(
					(entry) =>
						entry &&
						validHash(entry.input) &&
						validHash(entry.output) &&
						typeof entry.profile === 'string'
				);
			}
		} catch (error) {
			if (!(error instanceof SyntaxError)) throw error;
		}
	}
	const byInput = new Map(previous.map((entry) => [`${entry.profile}:${entry.input}`, entry]));
	const byOutput = new Map(previous.map((entry) => [`${entry.profile}:${entry.output}`, entry]));
	const current = new Map();
	for await (const relative of walk(directory)) {
		const extension = path.extname(relative).toLowerCase();
		if (!formats.has(extension)) {
			stats.skipped++;
			continue;
		}
		const file = path.join(directory, relative);
		if ((await lstat(file)).size > maxInputBytes) {
			stats.warnings++;
			log(`[images] Keeping ${relative}: exceeds the 50 MiB processing limit.`);
			continue;
		}
		const input = await readFile(file);
		if (isAnimatedPng(input)) {
			stats.skipped++;
			continue;
		}
		const inputHash = digest(input);
		const limits = profileFor(relative);
		const profile = `${extension}:${limits.size}:${limits.bytes}`;
		const outputEntry = byOutput.get(`${profile}:${inputHash}`);
		if (outputEntry) {
			current.set(`${profile}:${outputEntry.input}`, outputEntry);
			stats.skipped++;
			continue;
		}
		const key = `${profile}:${inputHash}`;
		const cached = byInput.get(key);
		if (cached && (await regularFile(path.join(cache, `${cached.output}.bin`)))) {
			const output = await readFile(path.join(cache, `${cached.output}.bin`));
			if (digest(output) === cached.output && output.length < input.length) {
				await writeFile(file, output);
				current.set(key, cached);
				stats.reused++;
				stats.savedBytes += input.length - output.length;
				continue;
			}
		}
		let output;
		try {
			const metadata = await sharp(input, inputOptions).metadata();
			if (metadata.format !== formats.get(extension) || (metadata.pages ?? 1) > 1) {
				stats.skipped++;
				continue;
			}
			// Browser-optimized CMS uploads already meet these budgets. Do not re-encode them.
			if (
				Math.max(metadata.width, metadata.height) <= limits.size &&
				input.length <= limits.bytes
			) {
				stats.skipped++;
				continue;
			}
			let pipeline = sharp(input, inputOptions).rotate().resize({
				width: limits.size,
				height: limits.size,
				fit: 'inside',
				withoutEnlargement: true
			});
			if (metadata.format === 'jpeg') pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true });
			if (metadata.format === 'png')
				pipeline = pipeline.png({ compressionLevel: 9, adaptiveFiltering: true });
			if (metadata.format === 'webp') pipeline = pipeline.webp({ quality: 80, effort: 4 });
			if (metadata.format === 'heif') pipeline = pipeline.avif({ quality: 55, effort: 4 });
			output = await pipeline.toBuffer();
		} catch (error) {
			stats.warnings++;
			log(`[images] Keeping ${relative}: ${error.message}`);
			continue;
		}
		if (output.length >= input.length) {
			stats.skipped++;
			continue;
		}
		const entry = { input: inputHash, output: digest(output), profile };
		// Persist cache first; a failed cache write must not leave an untracked optimized asset.
		const blob = path.join(cache, `${entry.output}.bin`);
		await rm(blob, { force: true });
		await writeFile(blob, output, { flag: 'wx' });
		await writeFile(file, output);
		byInput.set(key, entry);
		byOutput.set(`${profile}:${entry.output}`, entry);
		current.set(key, entry);
		stats.optimized++;
		stats.savedBytes += input.length - output.length;
	}
	await rm(indexFile, { force: true });
	await writeFile(indexFile, JSON.stringify({ policy, entries: [...current.values()] }) + '\n', {
		flag: 'wx'
	});
	const retained = new Set([...current.values()].map((entry) => `${entry.output}.bin`));
	for (const name of await readdir(cache)) {
		if (/^[a-f0-9]{64}\.bin$/.test(name) && !retained.has(name))
			await rm(path.join(cache, name), { force: true });
	}
	log(
		`[images] ${stats.optimized} optimized, ${stats.reused} cached, ${stats.skipped} unchanged, ${stats.warnings} warnings; saved ${(stats.savedBytes / 1024).toFixed(1)} KiB.`
	);
	return stats;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await optimizeImages();
}
