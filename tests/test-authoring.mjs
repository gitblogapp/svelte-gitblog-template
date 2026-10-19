import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, writeFile, symlink, rm, chmod } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { snapshotPaths, changedPaths } from '../scripts/lib/preservation.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = await mkdtemp(path.join(os.tmpdir(), 'gitblog-authoring-'));
const env = Object.fromEntries(
	Object.entries(process.env).filter(([key]) => !/^(PUBLIC_|DEEPL_|POST_IDS_ROOT)/.test(key))
);
const run = (args, ok = true, script = 'authoring.mjs') => {
	const result = spawnSync(process.execPath, [`scripts/${script}`, ...args], {
		cwd: fixture,
		env,
		encoding: 'utf8'
	});
	assert.equal(result.status === 0, ok, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
	return result.stdout;
};
const json = (args, ok = true) => JSON.parse(run(args, ok));
const sourcePath = path.join(fixture, 'content/posts/hello.md');
const translatedPath = path.join(fixture, 'content/translations/en/posts/hello.md');
const draftPath = path.join(fixture, '.gitblog/work/en.md');
const sourceBody =
	'## 시작\n\n한국어 설명. [문서](https://example.com/docs) ![그림](/uploads/figure.svg)\n\n```js\nconst value = 1;\n```\n';
const translatedBody =
	'## Start\n\nEnglish text. [Docs](https://example.com/docs) ![Figure](/uploads/figure.svg)\n\n```js\nconst value = 1;\n```\n';
const writeDraft = (body = translatedBody) =>
	writeFile(draftPath, matter.stringify(body, { title: 'Hello', description: 'A translation.' }));
const status = () => json(['status', 'hello']);
const accept = (revision, ok = true) =>
	json(
		['translation', 'hello', 'en', '--from', '.gitblog/work/en.md', '--source-hash', revision],
		ok
	);

try {
	await cp(path.join(root, 'scripts'), path.join(fixture, 'scripts'), { recursive: true });
	await symlink(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
	await mkdir(path.join(fixture, '.gitblog/work'), { recursive: true });
	await mkdir(path.join(fixture, 'static/uploads'), { recursive: true });
	await writeFile(path.join(fixture, 'static/uploads/figure.svg'), '<svg/>');
	await writeFile(
		path.join(fixture, '.env.production'),
		'PUBLIC_SOURCE_LOCALE=ko\nPUBLIC_TRANSLATION_LOCALES=en,ja\nPUBLIC_SITE_DESCRIPTION=소개\n'
	);
	await writeFile(
		path.join(fixture, '.gitblog/authoring.json'),
		JSON.stringify({ schemaVersion: 1, translationMode: 'manual' })
	);
	// Old blogs may lack the optional preserved instructions file. README is not an input.
	const missingUserContext = json(['context']);
	assert.equal(missingUserContext.translationMode, 'manual');
	assert.deepEqual(missingUserContext.userInstructions, {
		path: '.gitblog/user-instructions.md',
		exists: false
	});
	assert.ok(!missingUserContext.instructions.includes('README.md'));
	assert.ok(!missingUserContext.instructions.includes('.gitblog/user-instructions.md'));
	await assert.rejects(readFile(path.join(fixture, '.gitblog/user-instructions.md')), {
		code: 'ENOENT'
	});
	const personalRules = '# 개인 지침\r\n독자는 초보자입니다. 짧게 설명하세요.\r\n';
	await writeFile(path.join(fixture, '.gitblog/user-instructions.md'), personalRules);
	await writeFile(path.join(fixture, 'README.md'), '# My completely custom blog\n');
	const personalContext = json(['context']);
	assert.equal(personalContext.userInstructions.exists, true);
	assert.equal(personalContext.instructions[1], '.gitblog/user-instructions.md');
	assert.ok(personalContext.instructions.includes('docs/gitblog/github-auth.md'));
	for (const instruction of personalContext.instructions) {
		const instructionRoot = instruction === personalContext.userInstructions.path ? fixture : root;
		assert.ok((await readFile(path.join(instructionRoot, instruction))).length > 0, instruction);
	}
	assert.ok(!JSON.stringify(personalContext).includes('독자는 초보자'));
	assert.equal(
		await readFile(path.join(fixture, '.gitblog/user-instructions.md'), 'utf8'),
		personalRules
	);
	await rm(path.join(fixture, 'README.md'));
	assert.deepEqual(json(['context']), personalContext);
	await rm(path.join(fixture, '.gitblog/user-instructions.md'));
	await symlink(path.join(root, 'README.md'), path.join(fixture, '.gitblog/user-instructions.md'));
	json(['context'], false); // Do not follow a user instruction symlink outside the blog.
	await rm(path.join(fixture, '.gitblog/user-instructions.md'));
	await writeFile(path.join(fixture, '.gitblog/user-instructions.md'), '');
	assert.equal(json(['context']).userInstructions.exists, true);

	json(
		['new', '../escape', '--title', 'Bad', '--description', 'Bad', '--date', '2026-01-01'],
		false
	);
	json([
		'new',
		'hello',
		'--title',
		'안녕',
		'--description',
		'설명',
		'--date',
		'2026-10-18T10:00:00+09:00'
	]);
	const initial = await readFile(sourcePath, 'utf8');
	json(
		['new', 'hello', '--title', 'Overwrite', '--description', 'Bad', '--date', '2026-01-01'],
		false
	);
	assert.equal(await readFile(sourcePath, 'utf8'), initial);
	assert.equal(status().posts[0].stage, 'draft');
	json(['check']); // Drafts do not require translations.
	const source = matter(initial);
	source.data.published = true;
	await writeFile(sourcePath, matter.stringify(sourceBody, source.data));
	assert.equal(status().posts[0].stage, 'needs-translation');
	json(['check'], false);
	const revision = status().posts[0].sourceHash;
	await writeDraft();
	accept('0'.repeat(64), false); // An old source cannot be marked as current.
	accept(revision);
	json(['check'], false); // Japanese still missing.
	json(['translation', 'hello', 'ja', '--from', '.gitblog/work/en.md', '--source-hash', revision]);
	json(['check']);
	assert.equal(status().posts[0].stage, 'ready');
	const accepted = await readFile(translatedPath, 'utf8');
	const en = matter(accepted).data;
	assert.equal(en.id, source.data.id);
	assert.equal(en.date, source.data.date);
	assert.equal(en.translationSource, 'manual');
	await writeFile(translatedPath, accepted.replace('English text.', 'Modified translation.'));
	assert.match(json(['check'], false).errors.join('\n'), /changed after acceptance/);
	await writeFile(translatedPath, accepted);
	await writeDraft(translatedBody.replace('const value = 1;', 'const value = 2;'));
	assert.match(accept(revision, false).error, /changed code/);
	assert.equal(await readFile(translatedPath, 'utf8'), accepted);
	await writeDraft(translatedBody.replace('https://example.com/docs', 'https://evil.example'));
	accept(revision, false);
	await writeDraft();
	await writeFile(sourcePath, matter.stringify(sourceBody + '\n원문 수정.\n', source.data));
	accept(revision, false);
	assert.match(json(['check'], false).errors.join('\n'), /source changed/);
	await writeFile(sourcePath, matter.stringify(sourceBody, source.data));
	await rm(path.join(fixture, 'static/uploads/figure.svg'));
	assert.match(json(['check'], false).errors.join('\n'), /missing or unsafe asset/);
	await writeFile(path.join(fixture, 'static/uploads/figure.svg'), '<svg/>');
	const before = await snapshotPaths(fixture, ['content', 'static', '.gitblog/authoring.json']);
	run([], true, 'sync-content.mjs'); // No API key and nonempty site copy: manual mode must still pass.
	assert.deepEqual(
		changedPaths(
			before,
			await snapshotPaths(fixture, ['content', 'static', '.gitblog/authoring.json'])
		),
		[]
	);
	run([], false, 'translate-posts.mjs'); // Direct DeepL entry point must not overwrite manual files.
	run(['--write'], false, 'post-ids.mjs');
	await writeFile(path.join(fixture, 'content/translations/en/posts/orphan.md'), accepted);
	run([], false, 'sync-content.mjs');
	assert.equal(
		await readFile(path.join(fixture, 'content/translations/en/posts/orphan.md'), 'utf8'),
		accepted
	);
	await rm(path.join(fixture, 'content/translations/en/posts/orphan.md'));
	await writeFile(
		path.join(fixture, 'content/posts/duplicate.md'),
		await readFile(sourcePath, 'utf8')
	);
	assert.match(json(['check'], false).errors.join('\n'), /duplicate source id/);
	await rm(path.join(fixture, 'content/posts/duplicate.md'));
	await symlink(os.tmpdir(), path.join(fixture, '.gitblog/work/outside'));
	assert.match(
		json(
			[
				'translation',
				'hello',
				'en',
				'--from',
				'.gitblog/work/outside/file.md',
				'--source-hash',
				revision
			],
			false
		).error,
		/Symlinks/
	);
	json(
		[
			'translation',
			'hello',
			'../../outside',
			'--from',
			'.gitblog/work/en.md',
			'--source-hash',
			revision
		],
		false
	);
	json(['deploy-status', 'not-a-sha'], false);
	// Existing CMS slugs can contain Korean, spaces and periods; never rename them just to translate.
	const legacyFile = path.join(fixture, 'content/posts/한글 글.v1.md');
	await writeFile(
		legacyFile,
		matter.stringify(sourceBody, {
			...source.data,
			id: '03f6c88f-c091-4979-9ead-72148b604534',
			published: false
		})
	);
	const legacy = json(['status', '한글 글.v1']).posts[0];
	json([
		'translation',
		'한글 글.v1',
		'en',
		'--from',
		'.gitblog/work/en.md',
		'--source-hash',
		legacy.sourceHash
	]);
	await rm(legacyFile);
	await rm(path.join(fixture, 'content/translations/en/posts/한글 글.v1.md'));
	// There is no Git checkout in this fixture: deployment must fail without trying a push.
	json(['deploy'], false);
	// External boundaries are faked; no test may push or contact GitHub.
	await writeFile(
		path.join(fixture, '.env.production'),
		(await readFile(path.join(fixture, '.env.production'), 'utf8')) +
			'PUBLIC_SITE_TITLE=Fixture\nPUBLIC_SITE_URL=https://fixture.github.io/blog\nPUBLIC_SITE_REPOSITORY=fixture/blog\n'
	);
	const bin = path.join(fixture, 'bin');
	await mkdir(bin);
	const fake =
		`#!${process.execPath}\n` +
		String.raw`
import { appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const tool = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const command = args.join(' ');
appendFileSync('commands.jsonl', JSON.stringify({tool,args}) + '\n');
const head = 'a'.repeat(40);
if (tool === 'git') {
 if (command === 'status --porcelain') console.log(process.env.FAKE_DIRTY ? ' M content/posts/hello.md' : '');
 else if (command === 'branch --show-current') console.log(process.env.FAKE_BRANCH || 'main');
 else if (command === 'remote get-url --push --all origin') console.log('git@github.com:fixture/blog.git');
 else if (command === 'rev-parse HEAD') console.log(head);
 else if (args[0] !== 'push') throw new Error('Unexpected git command');
} else if (tool === 'npm') {
 if (process.env.FAKE_BUILD_FAIL) process.exit(1);
 if (process.env.FAKE_BUILD_MUTATE) writeFileSync('content/posts/unexpected.md', 'unexpected');
} else if (tool === 'gh') {
 if (args[0] === 'api') console.log(JSON.stringify(args[3].endsWith('/pages') ? {build_type:'workflow',cname:process.env.FAKE_PAGES_MISMATCH?'wrong.example.com':null} : {is_template:!!process.env.FAKE_TEMPLATE,default_branch:'main'}));
 else if (args[0] === 'repo') console.log(JSON.stringify({isTemplate:!!process.env.FAKE_TEMPLATE,defaultBranchRef:{name:'main'}}));
 else if (args[1] === 'list') console.log(process.env.FAKE_WAIT ? '[]' : '[{"databaseId":123}]');
 else if (args[1] === 'view') console.log(JSON.stringify({status:'completed',conclusion:process.env.FAKE_DEPLOY_FAIL?'failure':'success',headSha:head,url:'https://github.com/fixture/blog/actions/runs/123',jobs:[{name:'deploy',conclusion:process.env.FAKE_DEPLOY_FAIL?'skipped':'success'}]}));
 else throw new Error('Unexpected gh command');
}
`;
	for (const tool of ['git', 'gh', 'npm']) {
		await writeFile(path.join(bin, tool), fake);
		await chmod(path.join(bin, tool), 0o755);
	}
	env.PATH = `${bin}${path.delimiter}${env.PATH}`;
	for (const key of [
		'FAKE_DIRTY',
		'FAKE_TEMPLATE',
		'FAKE_BUILD_FAIL',
		'FAKE_BUILD_MUTATE',
		'FAKE_PAGES_MISMATCH'
	]) {
		env[key] = '1';
		json(['deploy'], false);
		delete env[key];
		await rm(path.join(fixture, 'content/posts/unexpected.md'), { force: true });
	}
	env.FAKE_BRANCH = 'feature';
	json(['deploy'], false);
	delete env.FAKE_BRANCH;
	const commandsBefore = (await readFile(path.join(fixture, 'commands.jsonl'), 'utf8'))
		.trim()
		.split('\n')
		.map(JSON.parse);
	assert.equal(
		commandsBefore.filter((entry) => entry.tool === 'git' && entry.args[0] === 'push').length,
		0
	);
	const pushed = json(['deploy']);
	assert.equal(pushed.stage, 'pushed');
	assert.equal(pushed.repository, 'fixture/blog');
	assert.equal(pushed.commit, 'a'.repeat(40));
	const commandsAfter = (await readFile(path.join(fixture, 'commands.jsonl'), 'utf8'))
		.trim()
		.split('\n')
		.map(JSON.parse);
	assert.deepEqual(
		commandsAfter
			.filter((entry) => entry.tool === 'git' && entry.args[0] === 'push')
			.map((entry) => entry.args),
		[['push', 'origin', `${pushed.commit}:refs/heads/main`]]
	);
	env.FAKE_WAIT = '1';
	assert.equal(json(['deploy-status', pushed.commit]).stage, 'awaiting-workflow');
	delete env.FAKE_WAIT;
	env.FAKE_DEPLOY_FAIL = '1';
	assert.equal(json(['deploy-status', pushed.commit]).stage, 'deployment-not-successful');
	delete env.FAKE_DEPLOY_FAIL;
	const deployed = json(['deploy-status', pushed.commit]);
	assert.equal(deployed.stage, 'deployed');
	assert.equal(deployed.ingestion, 'not_verified');
	await writeFile(
		path.join(fixture, '.gitblog/authoring.json'),
		'{"schemaVersion":1,"translationMode":"typo"}'
	);
	json(['context'], false);
	console.log(
		'Authoring scenarios passed: drafts, complete translations, stale/tampered content, code/links, assets, identities, read-only manual CI, direct DeepL guard, paths and deployment guards.'
	);
} finally {
	await rm(fixture, { recursive: true, force: true });
}
