import { load } from 'cheerio';
import robotsParser from 'robots-parser';

// `read` accepts absolute public URLs and returns {status, text, headers, url}.
// Local builds and deployed sites run the same content checks without executing JS.
export async function auditDiscovery(manifest, read, { live = false, limit = 10 } = {}) {
	const checks = [];
	const record = (status, check, url, detail) => checks.push({ status, check, url, detail });
	const cache = new Map();
	const get = async (url, agent) => {
		const key = `${agent || ''}:${url}`;
		if (!cache.has(key))
			cache.set(
				key,
				Promise.resolve()
					.then(() => read(url, agent))
					.catch((error) => ({ status: 0, text: '', headers: {}, url, error: error.message }))
			);
		return cache.get(key);
	};
	const site = manifest.siteUrl.replace(/\/+$/, '');
	const siteUrl = new URL(site);
	const rootRobots = `${siteUrl.origin}/robots.txt`;
	const policyRobots = `${site}/robots.txt`;
	const robotsUrl = live ? rootRobots : policyRobots;
	const robots = await get(robotsUrl);
	const isMissing = [404, 410].includes(robots.status);
	if (robots.status !== 200 && !isMissing)
		record('fail', 'robots', robotsUrl, `HTTP ${robots.status}; cannot determine crawl access.`);
	else {
		const parser = robotsParser(rootRobots, isMissing ? '' : robots.text);
		for (const { agent, allowed } of manifest.policy.crawlers) {
			const targets = [site + '/', ...manifest.pages.map((page) => page.canonicalUrl)];
			const mismatch = targets.find((url) => (parser.isAllowed(url, agent) !== false) !== allowed);
			record(
				mismatch ? (allowed ? 'fail' : 'warn') : 'pass',
				`robots:${agent}`,
				robotsUrl,
				mismatch
					? `Requested ${allowed ? 'allow' : 'block'} is not effective for ${mismatch}.`
					: `Matches requested ${allowed ? 'allow' : 'block'} policy.`
			);
		}
		if (!parser.getSitemaps().includes(`${site}/sitemap.xml`))
			record(
				'warn',
				'sitemap-discovery',
				robotsUrl,
				'Submit the sitemap in Google Search Console and Bing Webmaster Tools; the host-root robots does not advertise it.'
			);
	}
	if (siteUrl.pathname !== '/' && siteUrl.pathname !== '')
		record(
			live ? 'warn' : 'info',
			'host-root-policy',
			rootRobots,
			'Project-path robots.txt is not authoritative. Configure the host-root robots separately or use a custom domain.'
		);

	const xml = await get(`${site}/sitemap.xml`);
	const sitemap = load(xml.text, { xmlMode: true });
	const locations = new Set(
		sitemap('url > loc')
			.map((_, node) => sitemap(node).text())
			.get()
	);
	record(
		xml.status === 200 && sitemap('urlset').length === 1 ? 'pass' : 'fail',
		'sitemap',
		`${site}/sitemap.xml`,
		`HTTP ${xml.status}; ${locations.size} URLs.`
	);
	for (const page of manifest.pages)
		if (!locations.has(page.canonicalUrl))
			record('fail', 'sitemap-entry', page.canonicalUrl, 'Published article missing from sitemap.');
	const llms = await get(`${site}/llms.txt`);
	if (manifest.policy.llms) {
		const valid =
			llms.status === 200 &&
			manifest.pages.every(
				(page) =>
					llms.text.includes(`](${page.canonicalUrl})`) ||
					llms.text.includes(`](<${page.canonicalUrl}>)`)
			);
		record(
			valid ? 'pass' : 'fail',
			'llms-index',
			`${site}/llms.txt`,
			'Index must include every published article.'
		);
	} else
		record(
			llms.status === 404 ||
				(llms.status === 200 && llms.text.trim() === '# Discovery index disabled')
				? 'pass'
				: 'fail',
			'llms-disabled',
			`${site}/llms.txt`,
			'Disabled index must not list articles.'
		);

	// Round-robin languages so even a small deployed-site sample covers translations.
	const groups = [...new Set(manifest.pages.map((page) => page.locale))].map((locale) =>
		manifest.pages.filter((page) => page.locale === locale)
	);
	const ordered = [];
	for (let i = 0; groups.some((group) => group[i]); i++)
		for (const group of groups) if (group[i]) ordered.push(group[i]);
	const pages = live ? ordered.slice(0, limit) : ordered;
	for (const page of pages) {
		const response = await get(page.canonicalUrl);
		const $ = load(response.text);
		const content = $('.article-content').clone();
		content.find('script,style,nav').remove();
		const body = content.text().trim();
		const valid =
			response.status === 200 &&
			(response.url || page.canonicalUrl) === page.canonicalUrl &&
			$('h1').text().includes(page.title) &&
			body.length > 0;
		record(
			valid ? 'pass' : 'fail',
			'static-article',
			page.canonicalUrl,
			`HTTP ${response.status}; ${body.length} body characters without JavaScript.`
		);
		const directives = [
			$('meta[name="robots"]').attr('content') || '',
			response.headers?.['x-robots-tag'] || ''
		].join(',');
		record(
			/\b(noindex|nosnippet|none)\b|max-snippet\s*:\s*0\b/i.test(directives) ? 'fail' : 'pass',
			'index-controls',
			page.canonicalUrl,
			directives || 'No generic index/snippet restriction.'
		);
		const canonical = $('link[rel="canonical"]');
		record(
			canonical.length === 1 && canonical.attr('href') === page.canonicalUrl ? 'pass' : 'fail',
			'canonical',
			page.canonicalUrl,
			canonical.attr('href') || 'Missing canonical.'
		);
		for (const alternate of page.alternateLinks) {
			const match = $('link[rel="alternate"]')
				.toArray()
				.some(
					(node) =>
						$(node).attr('hreflang') === alternate.hreflang &&
						$(node).attr('href') === alternate.href
				);
			const target = await get(alternate.href);
			record(
				match && target.status === 200 ? 'pass' : 'fail',
				'translation',
				alternate.href,
				`${alternate.hreflang}; HTTP ${target.status}.`
			);
		}
		if (page.markdownUrl) {
			const markdown = await get(page.markdownUrl);
			record(
				markdown.status === 200 &&
					markdown.text.startsWith('---\n') &&
					markdown.text.includes(JSON.stringify(page.canonicalUrl))
					? 'pass'
					: 'fail',
				'markdown',
				page.markdownUrl,
				`HTTP ${markdown.status}; original URL metadata.`
			);
		} else {
			const markdown = await get(`${page.canonicalUrl}index.md`);
			record(
				[404, 410].includes(markdown.status) ? 'pass' : 'fail',
				'markdown-disabled',
				`${page.canonicalUrl}index.md`,
				`HTTP ${markdown.status}; disabled exports must be absent.`
			);
		}
	}
	if (live) {
		const deployed = await get(`${site}/.well-known/ai-discovery.json`);
		let actual;
		try {
			actual = JSON.parse(deployed.text);
		} catch {
			/* Report a mismatched deployment below. */
		}
		record(
			deployed.status === 200 && JSON.stringify(actual) === JSON.stringify(manifest)
				? 'pass'
				: 'fail',
			'deployed-manifest',
			`${site}/.well-known/ai-discovery.json`,
			'Compare the deployed policy and article set with this build.'
		);
		const target = pages[0]?.canonicalUrl || site + '/';
		for (const { agent, allowed } of manifest.policy.crawlers) {
			// Google-Extended is a robots policy token, not an HTTP user agent.
			if (!allowed || agent === 'Google-Extended') continue;
			const response = await get(target, agent);
			const $ = load(response.text);
			const valid =
				response.status === 200 &&
				(!pages.length || $('.article-content').text().trim().length > 0);
			record(
				valid ? 'pass' : 'fail',
				`http:${agent}`,
				target,
				`HTTP ${response.status}; user-agent probe from the CI host.`
			);
		}
		record(
			'info',
			'network-scope',
			site,
			'Probes do not verify provider IP ranges, actual bot visits, search indexing, or answer citations. Review CDN/WAF logs for those.'
		);
	}
	const count = (status) => checks.filter((check) => check.status === status).length;
	return {
		schemaVersion: 1,
		mode: live ? 'live' : 'build',
		checkedAt: new Date().toISOString(),
		siteUrl: site,
		sampledArticles: pages.length,
		totalArticles: manifest.pages.length,
		failures: count('fail'),
		warnings: count('warn'),
		checks
	};
}
