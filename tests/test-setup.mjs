import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, cp, chmod } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import {
	inspectSetup,
	applySetup,
	checkSetup,
	configurePages,
	patchSettings
} from '../scripts/lib/setup.mjs';
import { siteAddress, defaultPagesUrl, pagesBase } from '../scripts/lib/site-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = await mkdtemp(path.join(os.tmpdir(), 'gitblog-setup-'));
const repository = 'alice/blog';
const original =
	'# Keep this comment\nPUBLIC_SITE_TITLE=GitBlog\nPUBLIC_SITE_URL=https://blog.gitblog.app\nPUBLIC_SITE_REPOSITORY=gitblogapp/svelte-gitblog-template\nPUBLIC_SOURCE_LOCALE=ko\nPUBLIC_TRANSLATION_LOCALES=en,ja\nPUBLIC_GISCUS_REPO=gitblogapp/svelte-gitblog-template\nPUBLIC_GISCUS_REPO_ID=\nPUBLIC_GISCUS_CATEGORY_ID=\nPUBLIC_RELEASE_USE_TRANSLATIONS=false\nPRIVATE_FIXTURE=never-print-me\n';
let pages = null;
let repo = {
	name: 'blog',
	node_id: 'R_repo',
	default_branch: 'main',
	has_discussions: true,
	private: false,
	is_template: false
};
let categories = [
	{ id: 'D_general', name: 'General', slug: 'general' },
	{ id: 'D_announcement', name: 'Announcements', slug: 'announcements' }
];
let failPages = false;
let apiCalls = [];
const api = async (endpoint, method = 'GET', body) => {
	apiCalls.push({ endpoint, method, body });
	if (endpoint === `repos/${repository}`) return repo;
	if (endpoint === 'graphql')
		return {
			data: {
				repository: {
					discussionCategories: { nodes: categories, pageInfo: { hasNextPage: false } }
				}
			}
		};
	assert.equal(endpoint, `repos/${repository}/pages`);
	if (method === 'GET') {
		if (failPages) throw new Error('Permission denied');
		if (!pages) {
			const error = new Error('Missing');
			error.notFound = true;
			throw error;
		}
		return { ...pages };
	}
	if (method === 'POST') {
		pages = { ...body, cname: null };
		return pages;
	}
	assert.equal(method, 'PUT');
	Object.assign(pages, body);
	return null;
};
const answers = {
	PUBLIC_SITE_TITLE: "Alice's # Notes",
	PUBLIC_SITE_URL: 'https://notes.alice.dev',
	PUBLIC_SOURCE_LOCALE: 'ko',
	PUBLIC_TRANSLATION_LOCALES: 'en,ja',
	comments: 'enabled'
};
const inspect = (input = {}) => inspectSetup(fixture, input, api, repository);
const apply = (input) => applySetup(fixture, input, api, repository);
const configPages = (write = false) => configurePages(fixture, { write }, api, repository);
const read = (file) => readFile(path.join(fixture, file), 'utf8');
try {
	await writeFile(path.join(fixture, '.env.production'), original);
	const initial = await inspect();
	assert.equal(initial.stage, 'needs_input');
	assert.equal(initial.proposed.PUBLIC_SITE_REPOSITORY, repository);
	assert.equal(
		initial.questions.find((q) => q.key === 'PUBLIC_SITE_URL').suggested,
		'https://alice.github.io/blog'
	);
	assert.deepEqual(
		initial.questions.map((q) => q.key),
		[
			'PUBLIC_SITE_TITLE',
			'PUBLIC_SITE_URL',
			'PUBLIC_SOURCE_LOCALE',
			'PUBLIC_TRANSLATION_LOCALES',
			'comments'
		]
	);
	assert.ok(!JSON.stringify(initial).includes('never-print-me'));
	assert.equal((await apply({})).applied, false);
	assert.equal(await read('.env.production'), original);
	assert.ok(apiCalls.every((call) => call.method === 'GET'));
	const resolved = await inspect(answers);
	assert.equal(resolved.stage, 'ready');
	assert.equal(resolved.proposed.PUBLIC_GISCUS_REPO_ID, 'R_repo');
	assert.equal(resolved.proposed.PUBLIC_GISCUS_CATEGORY_ID, 'D_announcement');
	assert.equal((await apply(answers)).applied, true);
	assert.equal(await read('static/CNAME'), 'notes.alice.dev\n');
	const configured = await read('.env.production');
	assert.equal(parseEnv(configured).PUBLIC_SITE_TITLE, "Alice's # Notes");
	assert.ok(
		configured.includes('PUBLIC_RELEASE_USE_TRANSLATIONS=false\nPRIVATE_FIXTURE=never-print-me\n')
	);
	assert.equal((await checkSetup(fixture, repository)).ok, true);
	assert.equal((await inspect()).stage, 'ready');
	await apply({});
	assert.equal(await read('.env.production'), configured); // Resumable and idempotent.

	apiCalls = [];
	assert.equal((await configPages()).configurationReady, false);
	assert.ok(apiCalls.every((call) => call.method === 'GET'));
	const created = await configPages(true);
	assert.equal(created.configurationReady, true);
	assert.equal(created.dns, 'not_verified');
	assert.equal(created.deployment, 'not_verified');
	assert.ok(apiCalls.some((call) => call.method === 'POST' && call.body.build_type === 'workflow'));
	assert.ok(
		apiCalls.some((call) => call.method === 'PUT' && call.body.cname === 'notes.alice.dev')
	);
	apiCalls = [];
	await configPages(true);
	assert.ok(apiCalls.every((call) => call.method === 'GET')); // No repeat writes.
	pages.https_certificate = { state: 'approved' };
	assert.equal((await configPages(true)).httpsEnforced, true);
	failPages = true;
	apiCalls = [];
	await assert.rejects(configPages(true), /Permission denied/);
	assert.ok(apiCalls.every((call) => call.method === 'GET')); // 403 is not a missing site.
	failPages = false;

	const changed = {
		...answers,
		PUBLIC_SITE_URL: 'https://alice.github.io/blog',
		PUBLIC_TRANSLATION_LOCALES: '',
		comments: 'disabled'
	};
	await apply(changed);
	await assert.rejects(read('static/CNAME'), { code: 'ENOENT' });
	const settings = parseEnv(await read('.env.production'));
	for (const key of ['PUBLIC_GISCUS_REPO', 'PUBLIC_GISCUS_REPO_ID', 'PUBLIC_GISCUS_CATEGORY_ID'])
		assert.equal(settings[key], '');
	const cleared = await configPages(true);
	assert.equal(cleared.expectedCname, null);
	assert.equal(cleared.actualCname, null);
	assert.equal(cleared.configurationReady, true);
	assert.equal(cleared.dns, 'not_required');
	await writeFile(path.join(fixture, 'static/CNAME'), 'stale.example.com\n');
	assert.equal((await checkSetup(fixture, repository)).ok, false);
	await apply(changed);

	const good = await read('.env.production');
	for (const bad of [
		{ PUBLIC_SITE_URL: 'https://bob.github.io/blog' },
		{ PUBLIC_SITE_URL: 'http://notes.alice.dev' },
		{ PUBLIC_SITE_URL: 'https://notes.alice.dev/blog' },
		{ PUBLIC_SITE_URL: 'https://user:pass@notes.alice.dev' },
		{ PUBLIC_SITE_URL: 'https://notes.alice.dev?x=1' },
		{ PUBLIC_SITE_REPOSITORY: 'bob/blog' },
		{ PUBLIC_SOURCE_LOCALE: '../ko' },
		{ PUBLIC_TRANSLATION_LOCALES: 'en,ja,fr,de,es,it,pt,zh' },
		{ PUBLIC_GISCUS_REPO_ID: 'wrong' },
		{ PUBLIC_GISCUS_CATEGORY_ID: 'foreign' }
	]) {
		assert.equal((await apply({ ...answers, ...bad })).applied, false, JSON.stringify(bad));
		assert.equal(await read('.env.production'), good);
	}
	await assert.rejects(apply({ ...answers, GH_TOKEN: 'do-not-store' }), /Unsupported setup key/);
	await assert.rejects(apply({ ...answers, PUBLIC_SITE_TITLE: 'line\nbreak' }), /single-line/);
	await assert.rejects(apply({ ...answers, PUBLIC_SITE_TITLE: '$EXPAND_ME' }), /literal/);
	assert.throws(
		() => patchSettings('PUBLIC_SITE_TITLE=A\nPUBLIC_SITE_TITLE=B\n', { PUBLIC_SITE_TITLE: 'C' }),
		/Duplicate/
	);
	assert.equal(
		patchSettings('# comment\r\nPUBLIC_SITE_TITLE=A\r\nOTHER=B\r\n', { PUBLIC_SITE_TITLE: 'C' }),
		'# comment\r\nPUBLIC_SITE_TITLE="C"\r\nOTHER=B\r\n'
	);

	categories = [
		{ id: 'D_one', name: 'One', slug: 'one' },
		{ id: 'D_two', name: 'Two', slug: 'two' }
	];
	assert.ok((await inspect(answers)).questions.some((q) => q.key === 'PUBLIC_GISCUS_CATEGORY_ID'));
	assert.equal(
		(await inspect({ ...answers, PUBLIC_GISCUS_CATEGORY: 'Two' })).proposed
			.PUBLIC_GISCUS_CATEGORY_ID,
		'D_two'
	);
	repo.has_discussions = false;
	assert.ok((await inspect(answers)).errors.some((error) => error.includes('Enable Discussions')));
	repo.has_discussions = true;
	repo.private = true;
	assert.ok((await inspect(answers)).errors.some((error) => error.includes('public repository')));
	repo.private = false;
	repo.is_template = true;
	await assert.rejects(inspect(answers), /own repository/);
	repo.is_template = false;

	await symlink(path.join(fixture, '.env.production'), path.join(fixture, 'static/CNAME'));
	await assert.rejects(apply(changed), /Symlinks/);
	assert.equal(await read('.env.production'), good);
	await rm(path.join(fixture, 'static/CNAME'));
	assert.equal(defaultPagesUrl('Alice/alice.github.io'), 'https://alice.github.io');
	assert.equal(siteAddress('https://notes.alice.dev/').cname, 'notes.alice.dev');
	assert.equal(
		pagesBase({
			PUBLIC_SITE_URL: 'https://notes.alice.dev',
			GITHUB_ACTIONS: 'true',
			GITHUB_REPOSITORY: repository
		}),
		''
	);
	assert.equal(pagesBase({ PUBLIC_SITE_URL: 'https://alice.github.io/blog/' }), '/blog');
	assert.equal(
		pagesBase({ SITE_BASE_PATH: '/preview', PUBLIC_SITE_URL: 'https://notes.alice.dev' }),
		'/preview'
	);

	// Exercise the public CLI and exact gh --input JSON boundary without network access.
	await cp(path.join(root, 'scripts'), path.join(fixture, 'scripts'), { recursive: true });
	await symlink(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
	await mkdir(path.join(fixture, 'bin'));
	const fake =
		`#!${process.execPath}\n` +
		String.raw`
import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const tool=path.basename(process.argv[1]); const args=process.argv.slice(2);
const body=args.includes('--input')?JSON.parse(readFileSync(0,'utf8')):undefined;
appendFileSync('calls.jsonl',JSON.stringify({tool,args,body})+'\n');
if(tool==='git') console.log('https://github.com/alice/blog.git');
else {
 const endpoint=args[3]; const method=args[5];
 if(endpoint==='repos/alice/blog') console.log(JSON.stringify({name:'blog',node_id:'R_repo',default_branch:'main',has_discussions:true}));
 else if(endpoint==='repos/alice/blog/pages') {
  if(method==='GET') {if(!existsSync('pages.json')){console.error('HTTP 404');process.exit(1);} console.log(readFileSync('pages.json','utf8'));}
  else {const old=existsSync('pages.json')?JSON.parse(readFileSync('pages.json','utf8')):{};writeFileSync('pages.json',JSON.stringify({...old,...body}));}
 } else throw new Error('Unexpected request');
}
`;
	for (const tool of ['git', 'gh']) {
		await writeFile(path.join(fixture, 'bin', tool), fake);
		await chmod(path.join(fixture, 'bin', tool), 0o755);
	}
	await writeFile(path.join(fixture, 'answers.json'), JSON.stringify(changed));
	const env = {
		...process.env,
		PATH: `${path.join(fixture, 'bin')}${path.delimiter}${process.env.PATH}`
	};
	const run = (args) => {
		const result = spawnSync(process.execPath, ['scripts/setup.mjs', ...args], {
			cwd: fixture,
			env,
			encoding: 'utf8'
		});
		assert.equal(result.status, 0, result.stdout + result.stderr);
		return JSON.parse(result.stdout);
	};
	assert.equal(run(['apply', '--from', 'answers.json']).applied, true);
	assert.equal(run(['check']).ok, true);
	assert.equal(run(['pages']).configurationReady, true);
	assert.equal(run(['pages-status']).configurationReady, true);
	assert.ok(!JSON.stringify(run(['inspect'])).includes('never-print-me'));
	console.log(
		'Setup passed: questions, inferred IDs, preservation, validation, CNAME transitions, Pages API, permissions, HTTPS, CLI and no live writes.'
	);
} finally {
	await rm(fixture, { recursive: true, force: true });
}
