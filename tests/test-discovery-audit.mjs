import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditDiscovery } from '../scripts/lib/discovery-audit.mjs';

function fixture(base = '') {
	const site = `https://example.com${base}`;
	const pages = ['ko', 'en'].map((locale) => ({
		canonicalUrl: `${site}/${locale}/blog/article/`,
		title: `Article ${locale}`,
		locale,
		markdownUrl: `${site}/${locale}/blog/article/index.md`
	}));
	for (const page of pages)
		page.alternateLinks = pages.map((other) => ({
			hreflang: other.locale,
			href: other.canonicalUrl
		}));
	const manifest = {
		schemaVersion: 1,
		buildCommit: 'a'.repeat(40),
		siteUrl: site,
		policy: {
			crawlers: [
				{ agent: 'OAI-SearchBot', allowed: true },
				{ agent: 'GPTBot', allowed: false }
			],
			markdown: true,
			llms: true
		},
		pages
	};
	const responses = new Map();
	const set = (url, text, status = 200, headers = {}) =>
		responses.set(url, { status, text, url, headers });
	set(
		`${site}/robots.txt`,
		`User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: ${site}/sitemap.xml\n`
	);
	set(
		`${site}/sitemap.xml`,
		`<urlset>${pages.map((page) => `<url><loc>${page.canonicalUrl}</loc></url>`).join('')}</urlset>`
	);
	set(
		`${site}/llms.txt`,
		pages.map((page) => `- [${page.title}](${page.canonicalUrl})`).join('\n')
	);
	set(`${site}/.well-known/ai-discovery.json`, JSON.stringify(manifest));
	for (const page of pages) {
		set(
			page.canonicalUrl,
			`<html><head><link rel="canonical" href="${page.canonicalUrl}">${page.alternateLinks.map((link) => `<link rel="alternate" hreflang="${link.hreflang}" href="${link.href}">`).join('')}</head><body><h1>${page.title}</h1><div class="article-content">Readable original body.</div></body></html>`
		);
		set(
			page.markdownUrl,
			`---\nurl: ${JSON.stringify(page.canonicalUrl)}\n---\nReadable original body.`
		);
	}
	return {
		manifest,
		responses,
		set,
		read: async (url) => responses.get(url) || { status: 404, text: '', headers: {}, url }
	};
}

test('checks every local article and deployed samples without executing JavaScript', async () => {
	const f = fixture();
	assert.equal((await auditDiscovery(f.manifest, f.read)).failures, 0);
	const report = await auditDiscovery(f.manifest, f.read, { live: true, limit: 1 });
	assert.equal(report.failures, 0);
	assert.equal(report.totalArticles, 2);
	assert.equal(report.sampledArticles, 1);
	assert.ok(report.checks.some((check) => check.check === 'network-scope'));
});

test('uses host-root robots for live project-path sites and reports ineffective opt-outs', async () => {
	const f = fixture('/notes');
	const report = await auditDiscovery(f.manifest, f.read, { live: true });
	assert.equal(report.failures, 0);
	assert.ok(
		report.checks.some((check) => check.check === 'robots:GPTBot' && check.status === 'warn')
	);
	assert.ok(
		report.checks.some(
			(check) =>
				check.check === 'host-root-policy' && check.url === 'https://example.com/robots.txt'
		)
	);
	f.set('https://example.com/robots.txt', 'User-agent: *\nDisallow: /notes/');
	assert.ok((await auditDiscovery(f.manifest, f.read, { live: true })).failures > 0);
});

test('detects empty SPA bodies, noindex headers, bad canonicals and missing translations', async () => {
	const f = fixture();
	f.set(
		f.manifest.pages[0].canonicalUrl,
		'<h1>Article ko</h1><script>renderArticle()</script>',
		200,
		{ 'x-robots-tag': 'noindex' }
	);
	f.set(f.manifest.pages[1].canonicalUrl, 'Login required', 403);
	const report = await auditDiscovery(f.manifest, f.read);
	for (const name of ['static-article', 'index-controls', 'canonical', 'translation'])
		assert.ok(
			report.checks.some((check) => check.check === name && check.status === 'fail'),
			name
		);
});

test('detects stale deployments and user-agent blocking', async () => {
	const f = fixture();
	f.set(`${f.manifest.siteUrl}/.well-known/ai-discovery.json`, '{}');
	const report = await auditDiscovery(
		f.manifest,
		async (url, agent) =>
			agent ? { status: 403, text: 'CAPTCHA', headers: {}, url } : f.read(url),
		{ live: true }
	);
	assert.ok(
		report.checks.some((check) => check.check === 'deployed-manifest' && check.status === 'fail')
	);
	assert.ok(
		report.checks.some((check) => check.check === 'http:OAI-SearchBot' && check.status === 'fail')
	);
});

test('disabled exports must not leave public article copies behind', async () => {
	const f = fixture();
	f.manifest.policy.markdown = false;
	f.manifest.policy.llms = false;
	for (const page of f.manifest.pages) page.markdownUrl = null;
	assert.ok((await auditDiscovery(f.manifest, f.read)).failures > 0);
	f.set(`${f.manifest.siteUrl}/llms.txt`, '# Discovery index disabled\n');
	for (const page of f.manifest.pages) f.responses.delete(`${page.canonicalUrl}index.md`);
	assert.equal((await auditDiscovery(f.manifest, f.read)).failures, 0);
});
