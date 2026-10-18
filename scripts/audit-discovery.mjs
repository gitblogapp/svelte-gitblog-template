import { readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { auditDiscovery } from './lib/discovery-audit.mjs';

const live = process.argv.includes('--live');
const limitValue = process.argv.find((value) => value.startsWith('--limit='))?.slice(8) ?? '10';
const limit = Number(limitValue);
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
	throw new Error('--limit must be between 1 and 1000');
const build = path.resolve('build');
const manifest = JSON.parse(
	await readFile(path.join(build, '.well-known/ai-discovery.json'), 'utf8')
);
const site = new URL(manifest.siteUrl);
const base = site.pathname.replace(/\/+$/, '');
const localRead = async (address) => {
	const url = new URL(address);
	if (url.origin !== site.origin || (base && !url.pathname.startsWith(`${base}/`)))
		throw new Error('URL is outside the built site');
	let relative = decodeURIComponent(url.pathname.slice(base.length)).replace(/^\/+/, '');
	if (!relative || relative.endsWith('/')) relative += 'index.html';
	const file = path.resolve(build, relative);
	if (!file.startsWith(`${build}${path.sep}`)) throw new Error('Unsafe output path');
	try {
		return { status: 200, text: await readFile(file, 'utf8'), headers: {}, url: address };
	} catch (error) {
		if (error.code === 'ENOENT') return { status: 404, text: '', headers: {}, url: address };
		throw error;
	}
};
const remoteRead = async (address, agent) => {
	const url = new URL(address);
	if (url.protocol !== 'https:' || url.origin !== site.origin)
		throw new Error('Live checks require the configured HTTPS origin');
	const response = await fetch(url, {
		redirect: 'manual',
		signal: AbortSignal.timeout(15000),
		headers: { 'User-Agent': agent || 'GitBlog-DiscoveryCheck/1.0', 'Cache-Control': 'no-cache' }
	});
	return {
		status: response.status,
		text: await response.text(),
		headers: Object.fromEntries(response.headers),
		url: response.url
	};
};
const report = await auditDiscovery(manifest, live ? remoteRead : localRead, { live, limit });
const output = live ? 'discovery-audit-live.json' : 'discovery-audit-build.json';
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
for (const check of report.checks.filter((item) => item.status !== 'pass'))
	console.log(`${check.status.toUpperCase()} ${check.check}: ${check.detail}`);
console.log(
	`Discovery audit (${report.mode}): ${report.sampledArticles}/${report.totalArticles} articles; ${report.failures} failures, ${report.warnings} warnings. Report: ${output}`
);
if (process.env.GITHUB_STEP_SUMMARY) {
	const clean = (value) => String(value).replace(/[\r\n<>]/g, ' ');
	await appendFile(
		process.env.GITHUB_STEP_SUMMARY,
		`\n## Crawl access check (${report.mode})\n\n${report.sampledArticles}/${report.totalArticles} articles checked. ${report.failures} failures, ${report.warnings} warnings.\n\n${report.checks
			.filter((item) => item.status !== 'pass')
			.map((item) => `- **${item.status}** ${clean(item.check)}: ${clean(item.detail)}`)
			.join(
				'\n'
			)}\n\nFull results are in the discovery-audit artifact. This does not establish search indexing or AI citations.\n`
	);
}
if (report.failures) process.exitCode = 1;
