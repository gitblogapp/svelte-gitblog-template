import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotPaths, changedPaths } from '../scripts/lib/preservation.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = await mkdtemp(path.join(os.tmpdir(), 'gitblog-theme-integration-'));
const excluded = new Set(['.git', 'node_modules', '.svelte-kit', 'build']);
try {
	await cp(root, fixture, {
		recursive: true,
		filter: (source) =>
			!path
				.relative(root, source)
				.split(path.sep)
				.some((part) => excluded.has(part))
	});
	await symlink(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
	await writeFile(
		path.join(fixture, 'src/lib/extensions/Fixture.svelte'),
		`
<script lang="ts">
 import type { ExtensionContext } from '$lib/template/contracts';
 let { context }: { context: ExtensionContext } = $props();
</script>
<aside data-user-extension="preserved" data-user-post={context.post?.id ?? 'none'}>
 User feature: {context.locale}
</aside>
`
	);
	await writeFile(
		path.join(fixture, 'src/lib/extensions/registry.ts'),
		`
import Fixture from './Fixture.svelte';
import type { BlogExtension } from '$lib/template/contracts';
export const extensions: BlogExtension[] = [{ id: 'fixture', apiVersion: 1, components: {
 'article-before-body': Fixture, 'article-after-body': Fixture, 'site-footer': Fixture
} }];
`
	);
	const css = path.join(fixture, 'src/lib/theme/styles.css');
	await writeFile(
		css,
		`${await readFile(css, 'utf8')}\n:root { --gitblog-user-fixture: preserved; }\n`
	);
	await mkdir(path.join(fixture, 'content/posts'), { recursive: true });
	await mkdir(path.join(fixture, 'static/uploads'), { recursive: true });
	await writeFile(
		path.join(fixture, 'content/posts/preservation-fixture.md'),
		`---
id: 32ac91be-2d4a-4e0a-a83f-a944fbf126d0
title: Preservation fixture
description: Test user extensions and project page assets.
date: 2026-01-01
published: true
tts: true
ttsVoice: F2
cover: /uploads/preservation-fixture.svg
---
## Fixture heading

User content stays unchanged.
`
	);
	await writeFile(
		path.join(fixture, 'static/uploads/preservation-fixture.svg'),
		'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'
	);
	await writeFile(
		path.join(fixture, 'content/posts/related-fixture.md'),
		`---
id: 7a80f00a-6b21-4cb7-9057-c7487c6a1c8e
title: Related fixture
description: Another article in this blog.
date: 2026-01-02
published: true
---
Another article in this blog.
`
	);
	const speech = 'Fixture heading\n\nUser content stays unchanged.';
	const speechHash = createHash('sha256').update(speech).digest('hex');
	const audioPath = `content/audio/${'a'.repeat(64)}.mp3`;
	await mkdir(path.join(fixture, 'content/audio'), { recursive: true });
	await writeFile(path.join(fixture, audioPath), 'fixture-audio');
	await writeFile(
		path.join(fixture, 'content/audio/manifest.json'),
		JSON.stringify({
			version: 1,
			posts: [
				{
					postId: '32ac91be-2d4a-4e0a-a83f-a944fbf126d0',
					locale: 'en',
					voice: 'F2',
					textHash: speechHash,
					fullHash: speechHash,
					previewPath: audioPath,
					fullPath: audioPath,
					version: 'supertonic3-v1'
				}
			]
		})
	);
	const protectedPaths = [
		'content',
		'static',
		'src/lib/theme',
		'src/lib/extensions',
		'.env.production',
		'.pages.yml'
	];
	const before = await snapshotPaths(fixture, protectedPaths);
	const result = spawnSync('npm', ['run', 'build'], {
		cwd: fixture,
		env: {
			...process.env,
			SITE_BASE_PATH: '/preview',
			PUBLIC_SITE_URL: 'https://example.com/preview',
			PUBLIC_SITE_REPOSITORY: 'fixture/blog',
			GITHUB_REPOSITORY: 'fixture/current-fork',
			PUBLIC_HUB_ENABLED: 'true',
			PUBLIC_HUB_URL: 'https://gitblog.app',
			PUBLIC_RELATED_ENABLED: 'true',
			PUBLIC_GISCUS_ENABLED: 'false',
			PUBLIC_GISCUS_REPO_ID: '',
			PUBLIC_GISCUS_CATEGORY_ID: '',
			PUBLIC_RELATED_SHOW_THUMBNAIL: 'false',
			PUBLIC_RELATED_LIMIT: '6',
			PUBLIC_GOOGLE_SITE_VERIFICATION: 'preservation-fixture'
		},
		encoding: 'utf8',
		maxBuffer: 10 * 1024 * 1024
	});
	assert.equal(result.status, 0, result.error?.message ?? `${result.stdout}\n${result.stderr}`);
	assert.deepEqual(changedPaths(before, await snapshotPaths(fixture, protectedPaths)), []);
	const rss = await readFile(path.join(fixture, 'build/rss.xml'), 'utf8');
	const fixtureItem = (rss.match(/<item>[\s\S]*?<\/item>/g) ?? []).find((item) =>
		item.includes('32ac91be-2d4a-4e0a-a83f-a944fbf126d0')
	);
	assert.ok(
		fixtureItem?.includes(
			'<hub:bodyExcerpt>Fixture heading\n\nUser content stays unchanged.</hub:bodyExcerpt>'
		)
	);
	assert.ok(
		fixtureItem?.includes(
			'<description>Test user extensions and project page assets.</description>'
		)
	);
	assert.ok(Buffer.byteLength(rss) <= 2 * 1024 * 1024);
	const speechInput = JSON.parse(
		await readFile(path.join(fixture, 'build/.well-known/tts-input.json'), 'utf8')
	);
	const speechEntry = speechInput.posts.find(
		(p) => p.postId === '32ac91be-2d4a-4e0a-a83f-a944fbf126d0'
	);
	assert.equal(speechEntry.text, speech);
	assert.equal(speechEntry.voice, 'F2');
	assert.equal(speechEntry.textHash, speechHash);
	assert.ok(speechEntry.previewUrl.endsWith(audioPath));
	await assert.rejects(readFile(path.join(fixture, 'build', audioPath)));
	const home = await readFile(path.join(fixture, 'build/index.html'), 'utf8');
	assert.equal((home.match(/data-user-extension="preserved"/g) ?? []).length, 1);
	assert.match(home, /name="google-site-verification" content="preservation-fixture"/);
	// Linked icons must resolve to emitted files even under a GitHub Pages project path.
	const iconLinks = [...home.matchAll(/<link[^>]+href="([^"]*\/assets\/icons\/[^"]+)"/g)].map(
		(match) => match[1]
	);
	assert.equal(
		iconLinks.length,
		4,
		'all favicon and touch icon links must use the asset directory'
	);
	const manifest = JSON.parse(await readFile(path.join(fixture, 'build/site.webmanifest'), 'utf8'));
	assert.equal(manifest.icons.length, 2);
	for (const url of [...iconLinks, ...manifest.icons.map((icon) => icon.src)]) {
		const pathname = new URL(url, 'https://example.com/preview/').pathname;
		assert.ok(
			pathname.startsWith('/preview/assets/icons/'),
			`icon must include the project base: ${url}`
		);
		const asset = await readFile(path.join(fixture, 'build', pathname.slice('/preview/'.length)));
		assert.ok(asset.length > 0, `icon must be included in the build: ${url}`);
	}
	const article = await readFile(
		path.join(fixture, 'build/blog/preservation-fixture/index.html'),
		'utf8'
	);
	assert.ok(article.includes('<audio'));
	assert.ok(article.includes('raw.githubusercontent.com/fixture/current-fork/main/content/audio/'));
	assert.equal((article.match(/data-user-extension="preserved"/g) ?? []).length, 3);
	assert.ok(article.includes('class="related-boundary"'));
	assert.ok(
		!/class="giscus-section(?:\s|")/.test(article),
		'Hidden comments omit the setup-pending UI too'
	);
	assert.ok(!article.includes('<iframe'), 'Recommendations mount only after hydration');
	assert.ok(
		article.includes('fixture/current-fork'),
		'Embed uses the fork identity from the build'
	);
	assert.match(article, /showThumbnail:false/, 'Thumbnail option reaches the prerendered page');
	assert.match(article, /limit:6/, 'Recommendation limit reaches the prerendered page');
	assert.match(article, /data-user-post="32ac91be-2d4a-4e0a-a83f-a944fbf126d0"/);
	assert.ok(article.indexOf('data-user-extension') < article.indexOf('class="article-content"'));
	assert.ok(
		article.lastIndexOf('data-user-extension') > article.indexOf('class="article-content"')
	);
	const coverPath = article.match(/src="([^"]*uploads\/preservation-fixture\.svg)"/)?.[1];
	assert.ok(coverPath, 'Missing fixture cover image');
	assert.equal(
		new URL(coverPath, 'https://example.com/preview/blog/preservation-fixture/').pathname,
		'/preview/uploads/preservation-fixture.svg'
	);
	const assetDir = path.join(fixture, 'build/_app/immutable/assets');
	const styles = (
		await Promise.all(
			(await readdir(assetDir))
				.filter((name) => name.endsWith('.css'))
				.map((name) => readFile(path.join(assetDir, name), 'utf8'))
		)
	).join('\n');
	assert.match(styles, /--gitblog-user-fixture:\s*preserved/);
	console.log(
		'Template integration passed: user CSS, all extension points, post context, project base path, unchanged source files.'
	);
} finally {
	await rm(fixture, { recursive: true, force: true });
}
