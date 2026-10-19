import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectAppAccess } from '../scripts/lib/app-access.mjs';
import { githubClient } from '../scripts/lib/setup.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'gitblog-app-'));
const repository = 'alice/blog';
const defaults = {
	PUBLIC_SITE_REPOSITORY: repository,
	PUBLIC_GISCUS_ENABLED: 'true',
	PUBLIC_GISCUS_PROVIDER: 'gitblog',
	PUBLIC_GISCUS_HOST: 'https://gitblog.app',
	PUBLIC_GISCUS_REPO: repository,
	PUBLIC_GISCUS_REPO_ID: 'R_blog',
	PUBLIC_GISCUS_CATEGORY_ID: 'D_general',
	PUBLIC_GISCUS_CATEGORY: 'General'
};
let repo = {
	full_name: repository,
	node_id: 'R_blog',
	default_branch: 'main',
	has_discussions: true
};
let apiCalls = 0;
let requests = 0;
const api = async (endpoint, method = 'GET') => {
	apiCalls++;
	assert.equal(endpoint, `repos/${repository}`);
	assert.equal(method, 'GET');
	return repo;
};
let status = 200;
let props;
let raw;
const request = async (url, options) => {
	requests++;
	assert.equal(url.origin, 'https://gitblog.app');
	assert.equal(url.pathname, '/widget');
	assert.equal(url.searchParams.get('repo'), repository);
	assert.equal(url.searchParams.get('origin'), 'https://alice.github.io');
	assert.deepEqual(options.headers, { Accept: 'text/html' }); // No gh/PAT/session credentials.
	assert.equal(options.redirect, 'error');
	return new Response(
		raw ??
			`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ page: '/widget', props: { pageProps: props } })}</script>`,
		{ status }
	);
};
const configure = (overrides = {}) =>
	writeFile(
		path.join(root, '.env.production'),
		Object.entries({ ...defaults, ...overrides })
			.map(([key, value]) => `${key}=${value}`)
			.join('\n')
	);
const inspect = () => inspectAppAccess(root, { repository, api, request });
try {
	await configure();
	props = { repo: repository, origin: 'https://alice.github.io/', setupIssue: null };
	const ready = await inspect();
	assert.equal(ready.status, 'accessible');
	assert.equal(ready.widget, 'not_verified');
	assert.equal(ready.ok, true);
	// The real gh adapter inherits the chosen authentication. Neither credentials
	// nor an auth-mode-specific login is added to arguments or provider requests.
	const previousEnv = {
		PATH: process.env.PATH,
		GH_TOKEN: process.env.GH_TOKEN,
		GITHUB_TOKEN: process.env.GITHUB_TOKEN
	};
	try {
		await mkdir(path.join(root, 'bin'));
		const gh = path.join(root, 'bin', 'gh');
		await writeFile(
			gh,
			`#!${process.execPath}\nconst args = process.argv.slice(2);\nif (JSON.stringify(args) !== JSON.stringify(['api','--hostname','github.com','repos/alice/blog','--method','GET'])) process.exit(1);\nif (process.env.GH_TOKEN && process.env.GH_TOKEN !== 'fixture-fine-grained-token') process.exit(1);\nconsole.log(${JSON.stringify(JSON.stringify(repo))});\n`
		);
		await chmod(gh, 0o755);
		process.env.PATH = `${path.join(root, 'bin')}${path.delimiter}${previousEnv.PATH}`;
		delete process.env.GITHUB_TOKEN;
		for (const token of [undefined, 'fixture-fine-grained-token']) {
			if (token) process.env.GH_TOKEN = token;
			else delete process.env.GH_TOKEN;
			const report = await inspectAppAccess(root, { repository, api: githubClient(root), request });
			assert.equal(report.status, 'accessible');
			assert.ok(!JSON.stringify(report).includes('fixture-fine-grained-token'));
		}
	} finally {
		for (const [key, value] of Object.entries(previousEnv)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
	await mkdir(path.join(root, '.gitblog'));
	await writeFile(
		path.join(root, '.gitblog/setup.json'),
		JSON.stringify({ schemaVersion: 1, comments: 'disabled' })
	);
	assert.equal((await inspect()).status, 'accessible'); // Manual reconfiguration supersedes stale intent.
	await configure({ PUBLIC_GISCUS_REPO_ID: '', PUBLIC_GISCUS_CATEGORY_ID: '' });
	assert.equal((await inspect()).status, 'disabled');
	await rm(path.join(root, '.gitblog/setup.json'));
	await configure({ PUBLIC_GISCUS_HOST: 'https://gitblog.app/' });
	assert.equal((await inspect()).status, 'accessible');
	await configure();
	for (const issue of ['installation', 'permissions', 'repository']) {
		status = 403;
		props.setupIssue = issue;
		const report = await inspect();
		assert.equal(report.status, `needs_${issue}`);
		assert.equal(report.ok, false);
		assert.match(report.installUrl, /github\.com\/apps\/gitblog-app/);
	}
	// Approval is followed by a fresh server check; no previous status is persisted.
	status = 200;
	props.setupIssue = null;
	assert.equal((await inspect()).status, 'accessible');
	for (status of [401, 404, 429, 500, 503, 302]) assert.equal((await inspect()).status, 'unknown');
	status = 200;
	for (raw of [
		'<h1>Login</h1>',
		'<script id="__NEXT_DATA__">{broken</script>',
		'<script id="__NEXT_DATA__">null</script>'
	])
		assert.equal((await inspect()).status, 'unknown');
	raw = undefined;
	for (const invalid of [
		{ repo: 'bob/blog' },
		{ origin: 'https://evil.example' },
		{ setupIssue: undefined },
		{ setupIssue: 'installation' }
	]) {
		const previous = props;
		props = { ...props, ...invalid };
		assert.equal((await inspect()).status, 'unknown');
		props = previous;
	}
	assert.equal(
		(
			await inspectAppAccess(root, {
				repository,
				api,
				request: async () => {
					throw new Error('secret must not leak');
				}
			})
		).status,
		'unknown'
	);
	const before = { requests, apiCalls };
	for (const value of ['false', '0', 'off', 'no']) {
		await configure({ PUBLIC_GISCUS_ENABLED: value });
		assert.equal((await inspect()).status, 'disabled');
	}
	await configure({ PUBLIC_GISCUS_PROVIDER: 'giscus', PUBLIC_GISCUS_HOST: 'https://giscus.app' });
	assert.equal((await inspect()).status, 'external_provider');
	await configure({ PUBLIC_GISCUS_HOST: 'https://custom.example' });
	assert.equal((await inspect()).status, 'external_provider');
	for (const invalid of [
		{ PUBLIC_GISCUS_HOST: '' },
		{ PUBLIC_GISCUS_HOST: 'http://gitblog.app' },
		{ PUBLIC_GISCUS_HOST: 'https://user:password@gitblog.app' },
		{ PUBLIC_GISCUS_REPO: 'bob/blog' },
		{ PUBLIC_GISCUS_CATEGORY_ID: '' }
	]) {
		await configure(invalid);
		assert.equal((await inspect()).status, 'needs_configuration');
	}
	assert.deepEqual({ requests, apiCalls }, before); // Skip without even calling gh/provider.
	await configure();
	for (const invalid of [{ private: true }, { archived: true }, { has_discussions: false }]) {
		const previous = repo;
		repo = { ...repo, ...invalid };
		assert.equal((await inspect()).status, 'needs_repository');
		repo = previous;
	}
	repo = { ...repo, node_id: 'R_wrong' };
	assert.equal((await inspect()).status, 'needs_configuration');
	repo = { ...repo, is_template: true };
	await assert.rejects(inspect(), /own repository/);
	assert.equal(requests, before.requests);
	console.log(
		'App access scenarios passed: approval/recheck, credential isolation, provider failures, disabled/external providers and repository guards.'
	);
} finally {
	await rm(root, { recursive: true, force: true });
}
