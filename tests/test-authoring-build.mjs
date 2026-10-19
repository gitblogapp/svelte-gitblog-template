import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { snapshotPaths, changedPaths } from '../scripts/lib/preservation.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = await mkdtemp(path.join(os.tmpdir(), 'gitblog-manual-build-'));
const excluded = new Set([
	'.git',
	'node_modules',
	'.svelte-kit',
	'build',
	'content',
	'.gitblog/work'
]);
const env = Object.fromEntries(
	Object.entries(process.env).filter(
		([key]) => !/^(PUBLIC_|DEEPL_|GITHUB_|SITE_BASE_PATH|POST_IDS_ROOT)/.test(key)
	)
);
Object.assign(env, {
	PUBLIC_SOURCE_LOCALE: 'ko',
	PUBLIC_TRANSLATION_LOCALES: 'en,ja',
	PUBLIC_SITE_URL: 'https://fixture.github.io/blog/',
	PUBLIC_SITE_REPOSITORY: 'fixture/blog',
	GITHUB_ACTIONS: 'true',
	GITHUB_REPOSITORY: 'fixture/blog',
	GITHUB_REPOSITORY_OWNER: 'fixture',
	GITBLOG_BUILD_COMMIT: 'a'.repeat(40)
});
const run = (args) => {
	const result = spawnSync(args[0] === 'run' ? 'npm' : process.execPath, args, {
		cwd: fixture,
		env,
		encoding: 'utf8',
		maxBuffer: 15 * 1024 * 1024
	});
	assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
	return result.stdout;
};

try {
	await cp(root, fixture, {
		recursive: true,
		filter: (file) =>
			!path
				.relative(root, file)
				.split(path.sep)
				.some((part) => excluded.has(part)) && !file.includes(`${path.sep}.gitblog${path.sep}work`)
	});
	await symlink(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
	await mkdir(path.join(fixture, '.gitblog/work'), { recursive: true });
	await writeFile(
		path.join(fixture, '.gitblog/authoring.json'),
		'{"schemaVersion":1,"translationMode":"manual"}'
	);
	run([
		'scripts/authoring.mjs',
		'new',
		'harness-check',
		'--title',
		'하네스 검사',
		'--description',
		'번역 발행 확인',
		'--date',
		'2026-10-18T10:00:00+09:00'
	]);
	const sourceFile = path.join(fixture, 'content/posts/harness-check.md');
	const { data } = matter(await readFile(sourceFile, 'utf8'));
	data.published = true;
	data.category = '시장 분석';
	data.tags = ['비트코인', 'bitcoin'];
	await writeFile(sourceFile, matter.stringify('## 확인\n\n한국어 원문입니다.\n', data));
	const state = JSON.parse(run(['scripts/authoring.mjs', 'status']));
	for (const [locale, title, body] of [
		['en', 'Harness check', '## Check\n\nEnglish translation.'],
		['ja', 'ハーネスの確認', '## 確認\n\n日本語の翻訳です。']
	]) {
		await writeFile(
			path.join(fixture, `.gitblog/work/${locale}.md`),
			matter.stringify(body, { title, description: title })
		);
		run([
			'scripts/authoring.mjs',
			'translation',
			'harness-check',
			locale,
			'--from',
			`.gitblog/work/${locale}.md`,
			'--source-hash',
			state.posts[0].sourceHash
		]);
	}
	run(['scripts/taxonomy.mjs']);
	const dictionaryPath = path.join(fixture, 'content/taxonomy.json');
	const dictionary = JSON.parse(await readFile(dictionaryPath, 'utf8'));
	for (const row of dictionary.categories)
		Object.assign(row.labels, { ko: '시장 분석', en: 'Market Analysis', ja: '市場分析' });
	for (const row of dictionary.tags)
		Object.assign(row.labels, { ko: '비트코인', en: 'Bitcoin', ja: 'ビットコイン' });
	await writeFile(dictionaryPath, JSON.stringify(dictionary, null, 2) + '\n');
	run(['scripts/taxonomy.mjs', '--check']);
	// Upgraded blogs can retain a deleted README and have no personal instructions yet.
	await rm(path.join(fixture, 'README.md'), { force: true });
	await rm(path.join(fixture, '.gitblog/user-instructions.md'), { force: true });
	run(['run', 'test:harness-docs']);
	assert.equal(
		JSON.parse(run(['scripts/authoring.mjs', 'context'])).userInstructions.exists,
		false
	);
	await writeFile(path.join(fixture, 'README.md'), '# A personal blog introduction\r\n');
	await writeFile(
		path.join(fixture, '.gitblog/user-instructions.md'),
		'# My audience\r\nFor beginners.\r\n'
	);
	const protectedPaths = [
		'content',
		'static',
		'.gitblog/authoring.json',
		'README.md',
		'.gitblog/user-instructions.md'
	];
	const before = await snapshotPaths(fixture, protectedPaths);
	run(['scripts/sync-content.mjs', '--prepare']);
	run(['scripts/sync-content.mjs']);
	run(['run', 'build']);
	assert.deepEqual(changedPaths(before, await snapshotPaths(fixture, protectedPaths)), []);
	const manifest = JSON.parse(
		await readFile(path.join(fixture, 'build/.well-known/blog-hub.json'), 'utf8')
	);
	assert.deepEqual(
		manifest.feeds.map((feed) => feed.locale),
		['ko', 'en', 'ja']
	);
	assert.equal(manifest.enabled, true);
	assert.equal(manifest.buildCommit, env.GITBLOG_BUILD_COMMIT);
	for (const [locale, title] of [
		['ko', '하네스 검사'],
		['en', 'Harness check'],
		['ja', 'ハーネスの確認']
	]) {
		const prefix = locale === 'ko' ? '' : `${locale}/`;
		const rss = await readFile(path.join(fixture, `build/${prefix}rss.xml`), 'utf8');
		assert.ok(rss.includes(`<hub:postId>${data.id}</hub:postId>`));
		assert.ok(rss.includes(`<hub:locale>${locale}</hub:locale>`));
		assert.ok(rss.includes('<hub:sourceLocale>ko</hub:sourceLocale>'));
		assert.ok(rss.includes(`<title>${title}</title>`));
		const html = await readFile(
			path.join(fixture, `build/${prefix}blog/harness-check/index.html`),
			'utf8'
		);
		assert.ok(html.includes(title));
		assert.ok(html.includes('hreflang="en"'));
		assert.ok(rss.includes('<hub:taxonomy>'));
		assert.ok(
			rss.includes(
				locale === 'en'
					? '<category>Bitcoin</category>'
					: locale === 'ja'
						? '<category>ビットコイン</category>'
						: '<category>비트코인</category>'
			)
		);
		assert.equal(
			(rss.match(/<category>Bitcoin<\/category>/g) ?? []).length,
			locale === 'en' ? 1 : 0
		);
		assert.ok(html.includes('bitcoin') && html.includes('비트코인'));
		assert.ok(html.includes('data-pagefind-body'));
	}
	await assert.rejects(readFile(path.join(fixture, 'build/CNAME')), { code: 'ENOENT' });
	env.PUBLIC_SITE_URL = 'https://notes.example.com';
	run(['run', 'build']);
	assert.equal(await readFile(path.join(fixture, 'build/CNAME'), 'utf8'), 'notes.example.com\n');
	const customHtml = await readFile(
		path.join(fixture, 'build/blog/harness-check/index.html'),
		'utf8'
	);
	assert.ok(customHtml.includes('https://notes.example.com/blog/harness-check/'));
	assert.ok(!customHtml.includes('/blog/_app/'));
	assert.ok(customHtml.includes('/_app/immutable/'));
	assert.deepEqual(changedPaths(before, await snapshotPaths(fixture, protectedPaths)), []);
	console.log(
		'Manual authoring build passed without DeepL: ko/en/ja HTML, reciprocal language links, automatic project/custom-domain paths, CNAME, RSS, immutable IDs, manifest and source preservation.'
	);
} finally {
	if (process.env.KEEP_TAXONOMY_FIXTURE) console.log(`Taxonomy preview: ${fixture}`);
	else await rm(fixture, { recursive: true, force: true });
}
