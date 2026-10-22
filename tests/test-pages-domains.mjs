import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pagesOriginGuard, originGuardSource } from '../scripts/lib/pages-origin-guard.mjs';
import { primaryDomainWorker } from '../scripts/lib/pages-primary-domain.mjs';
import { preparePagesDeploy } from '../scripts/prepare-pages-deploy.mjs';

const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
const publicKey = await crypto.subtle.exportKey('jwk', pair.publicKey);
const proof = {
	version: 1,
	hostname: 'alice.gitblog.page',
	repositoryId: 1,
	token: 'assignment-one',
	origin: { hostname: 'alice-123.pages.dev', publicKey }
};
const env = {
	ASSETS: {
		fetch: async () => new Response('article', { headers: { 'content-type': 'text/html' } })
	}
};
const clock = 1800000000000;
const req = (path = '/article/?lang=ko', host = proof.origin.hostname) =>
	new Request(`https://${host}${path}`);
function guard(active = true, change = {}) {
	return pagesOriginGuard(proof, {
		now: () => clock,
		request: async () =>
			Response.json({
				active,
				hostname: proof.hostname,
				origin: proof.origin.hostname,
				token: proof.token,
				validUntil: clock + 60000,
				...change
			})
	});
}
async function signed(request, stamp = String(clock / 1000), token = proof.token) {
	const url = new URL(request.url);
	const payload = JSON.stringify([
		'gitblog-origin-v1',
		proof.hostname,
		token,
		request.method,
		url.origin,
		url.pathname + url.search,
		stamp
	]);
	const bytes = await crypto.subtle.sign(
		'Ed25519',
		pair.privateKey,
		new TextEncoder().encode(payload)
	);
	request.headers.set('x-gitblog-origin-time', stamp);
	request.headers.set('x-gitblog-origin-signature', Buffer.from(bytes).toString('base64'));
	return request;
}
test('active default origin redirects with path/query, signed proxy reads the same article without a loop', async () => {
	const worker = guard();
	const redirect = await worker.fetch(req(), env);
	assert.equal(redirect.status, 301);
	assert.equal(redirect.headers.get('location'), 'https://alice.gitblog.page/article/?lang=ko');
	const response = await worker.fetch(await signed(req()), env);
	assert.equal(response.status, 200);
	assert.equal(await response.text(), 'article');
	assert.equal(response.headers.get('cache-control'), 'no-store');
	assert.equal(response.headers.get('x-robots-tag'), null);
	const generated = await import(
		`data:text/javascript;base64,${Buffer.from(originGuardSource(proof)).toString('base64')}`
	);
	assert.equal(typeof generated.default.fetch, 'function');
});
test('pending, disabled, reassigned and expired connections leave the default origin available', async () => {
	for (const [active, change] of [
		[false, {}],
		[true, { token: 'another' }],
		[true, { origin: 'another.pages.dev' }],
		[true, { validUntil: clock - 1 }]
	]) {
		const response = await guard(active, change).fetch(req(), env);
		assert.equal(response.status, 200);
		assert.equal(response.headers.get('x-robots-tag'), null);
	}
});
test('signature is bound to method, path, query, timestamp and assignment; forged headers cannot bypass redirects', async () => {
	const worker = guard();
	for (const request of [
		await signed(req(), String(clock / 1000 - 61)),
		await signed(req(), undefined, 'other'),
		new Request('https://alice-123.pages.dev/other', { headers: (await signed(req())).headers }),
		new Request(req().url, { method: 'HEAD', headers: (await signed(req())).headers })
	])
		assert.equal((await worker.fetch(request, env)).status, 301);
	const forged = req();
	forged.headers.set('x-gitblog-proxy', '1');
	assert.equal((await worker.fetch(forged, env)).status, 301);
});
test('preview stays noindex; unavailable readiness does not expose an indexed duplicate', async () => {
	assert.equal(
		(await guard().fetch(req('/', 'branch.alice-123.pages.dev'), env)).headers.get('x-robots-tag'),
		'noindex'
	);
	const worker = pagesOriginGuard(proof, {
		request: async () => new Response(null, { status: 503 })
	});
	assert.equal((await worker.fetch(req(), env)).status, 503);
	assert.equal((await guard().fetch(req('/', 'evil.test'), env)).status, 404);
});
test('readiness cache expires after disconnect without modifying the deployed code', async () => {
	let time = clock,
		active = true,
		calls = 0;
	const worker = pagesOriginGuard(proof, {
		now: () => time,
		request: async () => {
			calls++;
			return Response.json({
				active,
				hostname: proof.hostname,
				origin: proof.origin.hostname,
				token: proof.token,
				validUntil: clock + 60000
			});
		}
	});
	assert.equal((await worker.fetch(req(), env)).status, 301);
	active = false;
	assert.equal((await worker.fetch(req(), env)).status, 301);
	assert.equal(calls, 1);
	time += 15001;
	assert.equal((await worker.fetch(req(), env)).status, 200);
	assert.equal(calls, 2);
});
test('personal domain and aliases redirect, canonical domain is served, preview is noindex', async () => {
	const worker = primaryDomainWorker({
		primary: 'blog.example.com',
		origin: proof.origin.hostname,
		aliases: ['old.example.com']
	});
	for (const host of [proof.origin.hostname, 'old.example.com'])
		assert.equal(
			(await worker.fetch(req('/post/?x=1', host), env)).headers.get('location'),
			'https://blog.example.com/post/?x=1'
		);
	assert.equal((await worker.fetch(req('/post/', 'blog.example.com'), env)).status, 200);
	assert.equal(
		(await worker.fetch(req('/', 'branch.alice-123.pages.dev'), env)).headers.get('x-robots-tag'),
		'noindex'
	);
});
test('deployment defaults to static; validates custom domain before enabling routing; cleanup is repeatable', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'pages-domains-'));
	const settings = {
		GITBLOG_DEPLOY_PROVIDER: 'cloudflare',
		CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
		CLOUDFLARE_PAGES_PROJECT: 'alice',
		PUBLIC_SITE_URL: `https://${proof.origin.hostname}`
	};
	let domainStatus = 'pending';
	const calls = [];
	const api = async (url, init) => {
		calls.push([url, init.method]);
		const result = url.endsWith('/domains/blog.example.com')
			? { name: 'blog.example.com', status: domainStatus }
			: url.endsWith('/domains')
				? []
				: { name: 'alice', subdomain: proof.origin.hostname };
		return Response.json({ success: true, result });
	};
	try {
		await preparePagesDeploy(directory, settings, 'token', api);
		await assert.rejects(readFile(join(directory, '_worker.js')), { code: 'ENOENT' });
		const custom = { ...settings, PUBLIC_SITE_URL: 'https://blog.example.com' };
		await assert.rejects(
			preparePagesDeploy(directory, custom, 'token', api),
			/Activate the custom domain/
		);
		domainStatus = 'active';
		await preparePagesDeploy(directory, custom, 'token', api);
		assert.match(
			await readFile(join(directory, '_worker.js'), 'utf8'),
			/gitblog-managed-primary-domain-v1/
		);
		assert.ok(calls.some(([, method]) => method === 'PATCH'));
		await preparePagesDeploy(directory, custom, 'token', api);
		await preparePagesDeploy(directory, settings, 'token', api);
		await assert.rejects(readFile(join(directory, '_worker.js')), { code: 'ENOENT' });
		await assert.rejects(readFile(join(directory, '_routes.json')), { code: 'ENOENT' });
		await mkdir(join(directory, '.well-known'));
		await writeFile(join(directory, '.well-known/gitblog-proxy.json'), JSON.stringify(proof));
		await preparePagesDeploy(
			directory,
			{ ...settings, PUBLIC_SITE_URL: `https://${proof.hostname}` },
			'token',
			api
		);
		assert.match(
			await readFile(join(directory, '_worker.js'), 'utf8'),
			/gitblog-managed-origin-redirect-v1/
		);
		await writeFile(join(directory, '_worker.js'), '// user code');
		await assert.rejects(preparePagesDeploy(directory, custom, 'token', api), /Custom _worker.js/);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
