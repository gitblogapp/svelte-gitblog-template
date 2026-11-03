import { setTimeout as sleep } from 'node:timers/promises';

// HTTP 0 means no HTTP response was received, not a crawler-policy rejection.
// Preserve useful error codes without logging response bodies, credentials or stacks.
export function networkFailure(error) {
  const codes = new Set();
  const visit = (item, depth = 0) => {
    if (!item || depth > 5) return;
    if (typeof item.code === 'string' && /^[A-Z0-9_]+$/.test(item.code)) codes.add(item.code);
    if (item.name === 'TimeoutError') codes.add('TIMEOUT');
    visit(item.cause, depth + 1);
    for (const child of item.errors || []) visit(child, depth + 1);
  };
  visit(error);
  const code = [...codes].join(', ') || 'FETCH_FAILED';
  const hint = /ENOTFOUND|EAI_AGAIN/.test(code)
    ? 'DNS lookup failed; check the public domain and DNS propagation.'
    : /CERT|TLS|SSL|SELF_SIGNED/.test(code)
      ? 'TLS verification failed; check certificate issuance and the domain. Verification remains enabled.'
      : /TIMEOUT|TIMEDOUT/.test(code)
        ? 'Connection timed out; check reachability from the CI runner.'
        : 'Connection failed; check the domain, hosting status and CI network access.';
  return `${code}: ${hint}`;
}

const transient = (status) => status === 0 || status === 408 || status === 429 || status >= 500;
export function responseDetail(response) {
  if (response.status === 0) return `No HTTP response (HTTP 0). ${response.error}`;
  if (response.status >= 300 && response.status < 400)
    return `HTTP ${response.status}; redirect not followed. Check the configured canonical domain and hosting redirect.`;
  if ([401, 403].includes(response.status))
    return `HTTP ${response.status}; access denied. Check authentication, CDN/WAF and crawler rules.`;
  return `HTTP ${response.status}`;
}

export function createLiveReader(siteUrl, { fetchImpl = fetch, wait = sleep } = {}) {
  const site = new URL(siteUrl);
  if (site.protocol !== 'https:' || site.username || site.password)
    throw new Error('Live checks require a public HTTPS URL without credentials');
  const failures = new Map();
  const request = async (address, agent, timeoutMs = 15000) => {
    const url = new URL(address);
    if (url.protocol !== 'https:' || url.origin !== site.origin || url.username || url.password)
      throw new Error('Live checks require the configured HTTPS origin');
    try {
      const response = await fetchImpl(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
        headers: {
          'User-Agent': agent || 'GitBlog-DiscoveryCheck/1.0',
          'Cache-Control': 'no-cache',
        },
      });
      return {
        status: response.status,
        text: await response.text(),
        headers: Object.fromEntries(response.headers),
        url: response.url || address,
      };
    } catch (error) {
      return { status: 0, text: '', headers: {}, url: address, error: networkFailure(error) };
    }
  };
  const read = async (address, agent) => {
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await request(address, agent);
      if (!transient(response.status) || attempt === 2) break;
      await wait(1000 * (attempt + 1));
    }
    if (response.status === 0)
      failures.set(`${agent || 'default'}:${address}`, {
        status: 'fail',
        check: `network:${agent || 'default'}`,
        url: address,
        detail: responseDetail(response),
      });
    return response;
  };
  return { request, read, failures };
}

// Poll the expected artifact, not just the homepage: a 200 can be an older deployment.
// Never fall back to a provider URL: that would conceal a broken public domain.
export async function waitForDeployment(
  manifest,
  request,
  { waitMs = 180000, intervalMs = 5000, now = Date.now, wait = sleep, onRetry = () => {} } = {},
) {
  const url = `${manifest.siteUrl.replace(/\/+$/, '')}/.well-known/ai-discovery.json`;
  const started = now();
  let attempts = 0;
  let detail;
  while (true) {
    const remaining = waitMs - (now() - started);
    const response = await request(
      url,
      undefined,
      Math.min(15000, Math.max(1, remaining || 15000)),
    );
    attempts++;
    let actual;
    try {
      actual = JSON.parse(response.text);
    } catch {
      /* A host can serve an HTML fallback. */
    }
    if (response.status === 200 && JSON.stringify(actual) === JSON.stringify(manifest))
      return {
        ready: true,
        attempts,
        url,
        detail: `Expected build is reachable after ${attempts} attempt(s).`,
      };
    detail =
      response.status === 200
        ? 'HTTP 200; deployed manifest does not match this build (stale deployment, cache or HTML fallback).'
        : responseDetail(response);
    const retryable =
      transient(response.status) || response.status === 404 || response.status === 200;
    const delay = Math.min(intervalMs, waitMs - (now() - started));
    if (!retryable || delay <= 0) break;
    onRetry(`Waiting for ${url}: ${detail}`);
    await wait(delay);
    if (now() - started >= waitMs) break;
  }
  return {
    ready: false,
    attempts,
    url,
    detail: `${detail} Expected deployment could not be verified; crawl/content checks were not run. Check PUBLIC_SITE_URL, DNS, TLS and deployment propagation, then rerun discovery:check -- --live.`,
  };
}
