import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deploymentConfig } from '../scripts/lib/deployment-config.mjs';
import { checkSetup, configurePages } from '../scripts/lib/setup.mjs';
import { load as parse } from 'js-yaml';

const settings = {
	GITBLOG_DEPLOY_PROVIDER: 'cloudflare',
	CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
	CLOUDFLARE_PAGES_PROJECT: 'blog',
	PUBLIC_SITE_URL: 'https://blog.pages.dev'
};
assert.equal(deploymentConfig({}).provider, 'github');
assert.equal(
	deploymentConfig({ GITBLOG_DEPLOY_PROVIDER: 'cloudflare' }, { allowPending: true }).ready,
	false
);
assert.throws(() => deploymentConfig({ GITBLOG_DEPLOY_PROVIDER: 'cloudflare' }));
for (const change of [
	{ GITBLOG_DEPLOY_PROVIDER: 'bad' },
	{ CLOUDFLARE_ACCOUNT_ID: 'bad' },
	{ CLOUDFLARE_PAGES_PROJECT: 'a\nb' },
	{ PUBLIC_SITE_URL: 'https://blog.pages.dev/path' },
	{ PUBLIC_SITE_URL: 'https://owner.github.io/blog' },
	{ PUBLIC_SITE_URL: 'https://user:secret@example.com' }
])
	assert.throws(() => deploymentConfig({ ...settings, ...change }));
assert.equal(deploymentConfig(settings).ready, true);
const folder = await mkdtemp(join(tmpdir(), 'gitblog-hosting-'));
try {
	await mkdir(join(folder, 'static'));
	const config = {
		...settings,
		PUBLIC_SITE_TITLE: 'Blog',
		PUBLIC_SITE_REPOSITORY: 'owner/blog',
		PUBLIC_SOURCE_LOCALE: 'en',
		PUBLIC_TRANSLATION_LOCALES: ''
	};
	await writeFile(
		join(folder, '.env.production'),
		Object.entries(config)
			.map(([k, v]) => `${k}=${v}`)
			.join('\n')
	);
	await writeFile(join(folder, 'static/CNAME'), 'old.example.com\n');
	assert.equal((await checkSetup(folder, 'owner/blog')).ok, true);
	const calls = [];
	const api = async (path) => {
		calls.push(path);
		if (path === 'repos/owner/blog') return { default_branch: 'main' };
		if (path.endsWith('/actions/secrets/CLOUDFLARE_API_TOKEN'))
			return { name: 'CLOUDFLARE_API_TOKEN' };
		throw new Error('Unexpected GitHub Pages access');
	};
	const result = await configurePages(folder, { write: true }, api, 'owner/blog');
	assert.equal(result.configurationReady, true);
	assert.equal(result.provider, 'cloudflare');
	assert.ok(!calls.some((path) => path.endsWith('/pages')));
	const missing = await configurePages(
		folder,
		{},
		async (path) => {
			if (path.endsWith('/CLOUDFLARE_API_TOKEN'))
				throw Object.assign(new Error('Missing'), { notFound: true });
			return api(path);
		},
		'owner/blog'
	);
	assert.equal(missing.configurationReady, false);
} finally {
	await rm(folder, { recursive: true, force: true });
}
const workflow = parse(
	await readFile(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8')
);
assert.ok(workflow.jobs.build.needs.includes('configuration'));
assert.equal(
	workflow.jobs.build.steps.find((step) => step.uses?.startsWith('actions/configure-pages')).if,
	"needs.configuration.outputs.provider == 'github'"
);
const github = workflow.jobs.deploy.steps.find((step) =>
	step.uses?.startsWith('actions/deploy-pages')
);
assert.equal(github.if, "needs.configuration.outputs.provider == 'github'");
const cloudflare = workflow.jobs.deploy.steps.find((step) => step.env?.CLOUDFLARE_API_TOKEN);
assert.equal(cloudflare.if, "needs.configuration.outputs.provider == 'cloudflare'");
assert.ok(cloudflare.run.includes('--branch "$CF_BRANCH"'));
assert.ok(cloudflare.run.includes('wrangler@'));
assert.ok(!JSON.stringify(workflow.jobs.build).includes('CLOUDFLARE_API_TOKEN'));
console.log(
	'Hosting provider validation, pending setup, secret metadata and workflow isolation passed.'
);
