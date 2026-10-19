import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedPaths, snapshotPaths } from '../scripts/lib/preservation.mjs';
import { marked } from 'marked';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = await mkdtemp(path.join(os.tmpdir(), 'gitblog-translated-seo-'));
const excluded = new Set(['.git', 'node_modules', '.svelte-kit', 'build']);
const locales = ['ko', 'en', 'en-gb', 'zh', 'zh-hans', 'zh-hant'];
const tags = ['ko', 'en', 'en-GB', 'zh', 'zh-Hans', 'zh-Hant'];
const slug = '한글 공백 ) & 100%';
const postDate = '2026-01-01T01:00:00.000Z';
const updated = '2026-02-02T02:00:00.000Z';
const translatedAt = '2026-03-03T03:00:00.000Z';
const decode = (value) => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"');
const attributes = (tag) =>
	Object.fromEntries(
		[...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decode(value)])
	);
const links = (html) => [...html.matchAll(/<link\b[^>]*>/g)].map(([tag]) => attributes(tag));
const alternates = (items) =>
	Object.fromEntries(
		items.filter((link) => link.hreflang).map((link) => [link.hreflang, link.href])
	);
const writePost = async (locale, name, id, extra = '') => {
	const dir = path.join(
		fixture,
		locale === 'ko' ? 'content/posts' : `content/translations/${locale}/posts`
	);
	await mkdir(dir, { recursive: true });
	await writeFile(
		path.join(dir, `${name}.md`),
		`---\nid: ${id}\ntitle: SEO ${locale}\ndescription: Translated SEO fixture\nprivateNote: NEVER_EXPORT_THIS_METADATA\ndate: ${postDate}\nupdated: ${updated}\n${extra}\n---\n## SEO fixture\n\nPublished article in ${locale}.\n`
	);
};
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
	await rm(path.join(fixture, 'content'), { recursive: true, force: true });
	for (const locale of locales) {
		await writePost(
			locale,
			slug,
			'9bd340f8-ec5a-40a8-9ed8-dc05703a3cf0',
			locale === 'ko' ? '' : `translatedAt: ${translatedAt}`
		);
		await writePost(
			locale,
			'unpublished-source',
			'0e7d9625-88ce-4f47-9a86-8cf09ab9021a',
			`published: ${locale !== 'ko'}`
		);
	}
	await writePost('ko', 'source-only', 'c914d46c-c694-46f2-8283-df993e917b03');
	await writePost('fr', slug, '9bd340f8-ec5a-40a8-9ed8-dc05703a3cf0', 'published: false');
	await writePost('de', slug, '9bd340f8-ec5a-40a8-9ed8-dc05703a3cf0'); // Not configured.
	const protectedPaths = [
		'content',
		'static',
		'src/lib/theme',
		'src/lib/extensions',
		'.env.production'
	];
	const before = await snapshotPaths(fixture, protectedPaths);
	for (const { base, exportsEnabled } of [
		{ base: '/preview', exportsEnabled: true },
		{ base: '', exportsEnabled: true },
		{ base: '/preview', exportsEnabled: false }
	]) {
		const site = `https://example.com${base}`;
		// Force a fresh prerender when switching between project Pages and a root/custom domain.
		for (const dir of ['.svelte-kit', 'build'])
			await rm(path.join(fixture, dir), { recursive: true, force: true });
		const result = spawnSync('npm', ['run', 'build'], {
			cwd: fixture,
			env: {
				...process.env,
				SITE_BASE_PATH: base,
				PUBLIC_SITE_URL: site,
				PUBLIC_GISCUS_ENABLED: exportsEnabled ? (base ? 'true' : '') : 'false',
				PUBLIC_GISCUS_PROVIDER: 'gitblog',
				PUBLIC_GISCUS_HOST: 'https://gitblog.app',
				PUBLIC_GISCUS_REPO: 'fixture/blog',
				PUBLIC_GISCUS_REPO_ID: base ? 'R_fixture' : '',
				PUBLIC_GISCUS_CATEGORY: 'Announcements',
				PUBLIC_GISCUS_CATEGORY_ID: base ? 'D_fixture' : '',
				PUBLIC_GOOGLE_SITE_VERIFICATION: 'google-fixture',
				PUBLIC_BING_SITE_VERIFICATION: exportsEnabled ? 'bing-fixture' : '',
				PUBLIC_AI_MARKDOWN_ENABLED: String(exportsEnabled),
				PUBLIC_AI_LLMS_ENABLED: String(exportsEnabled),
				PUBLIC_AI_OPENAI_TRAINING_ENABLED: 'false',
				PUBLIC_AI_GOOGLE_EXTENDED_ENABLED: 'false',
				PUBLIC_SITE_REPOSITORY: 'fixture/blog',
				PUBLIC_SOURCE_LOCALE: 'ko',
				PUBLIC_TRANSLATION_LOCALES: [...locales.slice(1), 'ja', 'fr'].join(',')
			},
			encoding: 'utf8',
			maxBuffer: 10 * 1024 * 1024
		});
		assert.equal(result.status, 0, result.error?.message ?? `${result.stdout}\n${result.stderr}`);
		const sitemap = await readFile(path.join(fixture, 'build/sitemap.xml'), 'utf8');
		const discovery = JSON.parse(
			await readFile(path.join(fixture, 'build/.well-known/ai-discovery.json'), 'utf8')
		);
		const llms = await readFile(path.join(fixture, 'build/llms.txt'), 'utf8');
		const indexTargets = [];
		marked.walkTokens(marked.lexer(llms), (token) => {
			if (token.type === 'link') indexTargets.push(token.href);
		});
		if (exportsEnabled)
			for (const page of discovery.pages)
				assert.ok(
					indexTargets.includes(page.canonicalUrl),
					'Markdown parser must preserve special-character article URLs'
				);
		assert.ok(!JSON.stringify(discovery).includes('unpublished-source'));
		assert.ok(!llms.includes('unpublished-source'));
		assert.equal(discovery.pages.length, locales.length + 1);
		if (!exportsEnabled) assert.equal(llms.trim(), '# Discovery index disabled');
		assert.match(sitemap, /xmlns:xhtml="http:\/\/www.w3.org\/1999\/xhtml"/);
		assert.ok(!sitemap.includes('unpublished-source'));
		const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, xml]) => ({
			url: decode(xml.match(/<loc>(.*?)<\/loc>/)[1]),
			lastmod: xml.match(/<lastmod>(.*?)<\/lastmod>/)?.[1],
			alternates: alternates(
				[...xml.matchAll(/<xhtml:link\b[^>]*>/g)].map(([tag]) => attributes(tag))
			)
		}));
		assert.equal(entries.length, 8 + locales.length + 1); // Homes, translated cluster, source-only.
		assert.equal(new Set(entries.map((entry) => entry.url)).size, entries.length);
		const expected = Object.fromEntries(
			locales.map((locale, index) => [
				tags[index],
				`${site}/${locale === 'ko' ? '' : `${locale}/`}blog/${encodeURIComponent(slug)}/`
			])
		);
		expected['x-default'] = expected.ko;
		for (const entry of entries) {
			assert.ok(entry.url.startsWith(`${site}/`));
			const relative = decodeURIComponent(new URL(entry.url).pathname.slice(base.length + 1));
			const html = await readFile(path.join(fixture, 'build', relative, 'index.html'), 'utf8');
			const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
			const verificationTags = [...head.matchAll(/<meta\b[^>]*>/g)].map(([tag]) => attributes(tag));
			assert.deepEqual(
				verificationTags.filter((tag) => tag.name === 'msvalidate.01').map((tag) => tag.content),
				exportsEnabled ? ['bing-fixture'] : []
			);
			assert.deepEqual(
				verificationTags
					.filter((tag) => tag.name === 'google-site-verification')
					.map((tag) => tag.content),
				['google-fixture']
			);
			const htmlLinks = links(head);
			assert.deepEqual(
				htmlLinks.filter((link) => link.rel === 'canonical').map((link) => link.href),
				[entry.url]
			);
			assert.deepEqual(
				alternates(htmlLinks),
				entry.alternates,
				'HTML and XML alternate sets must agree'
			);
			for (const alternate of Object.values(entry.alternates)) {
				const target = entries.find((candidate) => candidate.url === alternate);
				assert.ok(target, `Alternate must have a published page: ${alternate}`);
				assert.deepEqual(target.alternates, entry.alternates, 'Alternates must be reciprocal');
			}
			if (relative.includes('/blog/') || relative.startsWith('blog/')) {
				assert.equal(/class="giscus-section(?:\s|")/.test(html), exportsEnabled);
				assert.equal(/class="giscus-container(?:\s|")/.test(html), exportsEnabled && Boolean(base));
				assert.equal(/class="giscus-empty font-label(?:\s|")/.test(html), exportsEnabled && !base);
				const markdownFile = path.join(fixture, 'build', relative, 'index.md');
				if (exportsEnabled) {
					const markdown = await readFile(markdownFile, 'utf8');
					assert.ok(markdown.includes('## SEO fixture'));
					assert.ok(markdown.includes(JSON.stringify(entry.url)));
					assert.ok(!markdown.includes('NEVER_EXPORT_THIS_METADATA'));
					assert.ok(head.includes('type="text/markdown"'));
					assert.ok(llms.includes(entry.url));
				} else {
					await assert.rejects(readFile(markdownFile), { code: 'ENOENT' });
					assert.ok(!head.includes('type="text/markdown"'));
				}
				const jsonLd = JSON.parse(
					head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]
				);
				assert.equal(jsonLd.url, entry.url);
				assert.equal(jsonLd.mainEntityOfPage['@id'], entry.url);
				assert.equal(jsonLd.datePublished, postDate);
				assert.equal(jsonLd.dateModified, entry.lastmod);
				const isSource = relative.startsWith('blog/');
				assert.equal(entry.lastmod, isSource ? updated : translatedAt);
				assert.ok(head.includes(`property="article:modified_time" content="${entry.lastmod}"`));
				assert.ok(html.includes(`<html lang="${jsonLd.inLanguage}">`));
				if (relative.includes('source-only'))
					assert.deepEqual(entry.alternates, { ko: entry.url, 'x-default': entry.url });
				else assert.deepEqual(entry.alternates, expected);
			}
		}
		for (const locale of [...locales, 'ja', 'fr']) {
			const prefix = locale === 'ko' ? '' : `${locale}/`;
			const rss = await readFile(path.join(fixture, `build/${prefix}rss.xml`), 'utf8');
			assert.ok(!rss.includes('unpublished-source'));
			await assert.rejects(
				readFile(path.join(fixture, `build/${prefix}blog/unpublished-source/index.md`)),
				{ code: 'ENOENT' }
			);
			await assert.rejects(
				readFile(path.join(fixture, `build/${prefix}blog/unpublished-source/index.html`)),
				{ code: 'ENOENT' }
			);
		}
		console.log(
			`Translated SEO passed (${base || 'root'}): self canonicals, reciprocal HTML/XML alternates, generic/region/script tags, timestamps, escaped slugs, missing/draft translations and unpublished sources.`
		);
	}
	assert.deepEqual(changedPaths(before, await snapshotPaths(fixture, protectedPaths)), []);
} finally {
	await rm(fixture, { recursive: true, force: true });
}
