import { readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { auditDiscovery } from './lib/discovery-audit.mjs';
import { createLiveReader, waitForDeployment } from './lib/discovery-live.mjs';

const live = process.argv.includes('--live');
const limitValue = process.argv.find((value) => value.startsWith('--limit='))?.slice(8) ?? '10';
const limit = Number(limitValue);
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
  throw new Error('--limit must be between 1 and 1000');
const waitSeconds = Number(
  process.argv.find((value) => value.startsWith('--wait-seconds='))?.slice(15) ?? '180',
);
if (!Number.isSafeInteger(waitSeconds) || waitSeconds < 0 || waitSeconds > 600)
  throw new Error('--wait-seconds must be between 0 and 600');
const build = path.resolve('build');
const manifest = JSON.parse(
  await readFile(path.join(build, '.well-known/ai-discovery.json'), 'utf8'),
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
let report;
if (live) {
  console.log(`Checking public deployment: ${manifest.siteUrl} (readiness wait: ${waitSeconds}s)`);
  const remote = createLiveReader(manifest.siteUrl);
  const readiness = await waitForDeployment(manifest, remote.request, {
    waitMs: waitSeconds * 1000,
    onRetry: (message) => console.log(message),
  });
  if (readiness.ready) {
    report = await auditDiscovery(manifest, remote.read, { live, limit });
    report.checks.push(...remote.failures.values());
  } else {
    report = {
      schemaVersion: 1,
      mode: 'live',
      checkedAt: new Date().toISOString(),
      siteUrl: manifest.siteUrl,
      sampledArticles: 0,
      totalArticles: manifest.pages.length,
      checks: [],
      warnings: 0,
    };
  }
  report.checks.unshift({
    status: readiness.ready ? 'pass' : 'fail',
    check: 'deployment-readiness',
    url: readiness.url,
    detail: readiness.detail,
  });
  report.readinessAttempts = readiness.attempts;
  report.failures = report.checks.filter((check) => check.status === 'fail').length;
} else report = await auditDiscovery(manifest, localRead, { limit });
const output = live ? 'discovery-audit-live.json' : 'discovery-audit-build.json';
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
for (const check of report.checks.filter((item) => item.status !== 'pass'))
  console.log(`${check.status.toUpperCase()} ${check.check}: ${check.detail} URL: ${check.url}`);
console.log(
  `Discovery audit (${report.mode}): ${report.sampledArticles}/${report.totalArticles} articles; ${report.failures} failures, ${report.warnings} warnings. Report: ${output}`,
);
if (process.env.GITHUB_STEP_SUMMARY) {
  const clean = (value) => String(value).replace(/[\r\n<>]/g, ' ');
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `\n## Crawl access check (${report.mode})\n\n${report.sampledArticles}/${report.totalArticles} articles checked. ${report.failures} failures, ${report.warnings} warnings.\n\n${report.checks
      .filter((item) => item.status !== 'pass')
      .map(
        (item) =>
          `- **${item.status}** ${clean(item.check)}: ${clean(item.detail)} URL: ${clean(item.url)}`,
      )
      .join(
        '\n',
      )}\n\nFull results are in the discovery-audit artifact. This does not establish search indexing or AI citations.\n`,
  );
}
if (report.failures) process.exitCode = 1;
