import { collectTaxonomy, missingTaxonomy, taxonomyFile } from './lib/taxonomy.ts';
import { randomUUID } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import matter from 'gray-matter';
import { loadEnvFile } from './lib/env.mjs';
import { snapshotPaths, changedPaths } from './lib/preservation.mjs';
import {
	inspect,
	locales,
	readPolicy,
	validSlug,
	readPost,
	postErrors,
	sourceHash,
	translationHash,
	translationErrors,
	writeContent,
	safePath,
	markdownFiles
} from './lib/authoring.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(path.join(root, '.env.production'));
const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		title: { type: 'string' },
		description: { type: 'string' },
		date: { type: 'string' },
		from: { type: 'string' },
		'source-hash': { type: 'string' }
	}
});
const [command = 'context', slug, locale] = positionals;
const output = (value) => console.log(JSON.stringify(value, null, 2));
const run = (bin, args, inherit = false) => {
	const result = spawnSync(bin, args, {
		cwd: root,
		encoding: 'utf8',
		// Reserve stdout for the final machine-readable result, even during builds/pushes.
		stdio: inherit ? ['inherit', 2, 2] : 'pipe',
		maxBuffer: 10 * 1024 * 1024
	});
	if (result.error || result.status !== 0)
		throw new Error(
			result.error?.message || `${bin} ${args.join(' ')} failed: ${result.stderr || result.status}`
		);
	return result.stdout?.trim() ?? '';
};
const check = async () => {
	const report = await inspect(root, process.env);
	if (!report.ok) throw new Error(report.errors.join('\n'));
	return report;
};
const verify = async () => {
	const report = await check();
	const protectedPaths = [
		'content',
		'static',
		'.env.production',
		'.gitblog/authoring.json',
		'README.md',
		'.gitblog/user-instructions.md'
	];
	const before = await snapshotPaths(root, protectedPaths);
	run('npm', ['run', 'build'], true);
	const changes = changedPaths(before, await snapshotPaths(root, protectedPaths));
	if (changes.length) throw new Error(`Build changed authoring inputs: ${changes.join(', ')}`);
	return { ...report, build: 'passed', hubContract: 'passed', deployment: 'not_started' };
};
const githubRepository = () => {
	const remote = run('git', ['remote', 'get-url', '--push', '--all', 'origin']);
	const match = remote.match(
		/^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/
	);
	if (!match) throw new Error('deploy requires a github.com origin remote');
	return match[1];
};

try {
	if (command === 'context') {
		const userInstructions = { path: '.gitblog/user-instructions.md', exists: false };
		try {
			const file = await lstat(await safePath(root, userInstructions.path));
			if (!file.isFile()) throw new Error('User instructions must be a regular file');
			userInstructions.exists = true;
		} catch (error) {
			if (error.code !== 'ENOENT') throw error;
		}
		const collections = {};
		for (const kind of ['categories', 'tags'])
			collections[kind] = await Promise.all(
				(await markdownFiles(root, `content/${kind}`)).map(
					async (file) => (await readPost(root, file)).data.title
				)
			);
		output({
			...(await readPolicy(root)),
			...locales(process.env),
			collections,
			taxonomy: {
				path: taxonomyFile,
				missing: missingTaxonomy(
					await collectTaxonomy(root, locales(process.env).source),
					locales(process.env).targets
				)
			},
			siteCopy: Object.fromEntries(
				['TAGLINE', 'DESCRIPTION', 'FOOTER'].map((key) => [
					key.toLowerCase(),
					process.env[`PUBLIC_SITE_${key}`] ?? ''
				])
			),
			userInstructions,
			instructions: [
				'AGENTS.md',
				...(userInstructions.exists ? [userInstructions.path] : []),
				'docs/gitblog/agent-workflow.md',
				'docs/gitblog/README.md',
				'docs/gitblog/setup.md',
				'docs/gitblog/github-auth.md',
				'docs/gitblog/github-app.md',
				'docs/gitblog/authoring.md',
				'docs/gitblog/llm-writing-guidelines.md',
				'docs/gitblog/taxonomy.md',
				'.gitblog/authoring.json'
			],
			firstLaunch: 'Run npm run site:setup before writing or publishing the first post.',
			commentSetup:
				'site:configure → site:app:status → owner installation approval if needed → site:app:status → deploy → verify live article widget',
			commands: ['new', 'status', 'translation', 'check', 'verify', 'deploy', 'deploy-status'],
			workflow:
				'new → edit source → status → translation per locale → check → verify → commit → deploy → deploy-status',
			note: 'The LLM writes and reviews prose. Commands never generate prose or call an LLM.'
		});
	} else if (command === 'new') {
		validSlug(slug, true);
		if (!values.title || !values.description || !values.date)
			throw new Error('new requires --title, --description, --date (with the intended timezone)');
		const raw = matter.stringify('\nWrite the article here.\n', {
			id: randomUUID(),
			title: values.title,
			description: values.description,
			date: values.date,
			published: false,
			category: 'Notes',
			tags: []
		});
		const post = { ...matter(raw), raw };
		const errors = await postErrors(root, post);
		if (errors.length) throw new Error(errors.join('; '));
		const file = `content/posts/${slug}.md`;
		await writeContent(root, file, raw, true);
		output({
			stage: 'draft',
			path: file,
			id: post.data.id,
			next: 'Write the source; set published: true only for intended publication, then run status.'
		});
	} else if (command === 'translation') {
		validSlug(slug);
		const languages = locales(process.env);
		if ((await readPolicy(root)).translationMode !== 'manual')
			throw new Error('Set translationMode to manual before accepting LLM translations');
		if (!languages.targets.includes(locale))
			throw new Error('Locale must be a configured translation target');
		if (!values.from || !values['source-hash'])
			throw new Error(
				'translation requires --from and the --source-hash returned by status BEFORE translating'
			);
		const source = await readPost(root, `content/posts/${slug}.md`);
		if (sourceHash(source.raw) !== values['source-hash'])
			throw new Error(
				'Source changed since translation began. Read and translate the current revision.'
			);
		const sourceErrors = await postErrors(root, source);
		if (sourceErrors.length) throw new Error(sourceErrors.join('; '));
		const draft = matter(await readFile(await safePath(root, values.from), 'utf8'));
		const data = {
			...source.data,
			title: draft.data.title,
			description: draft.data.description,
			locale,
			sourceLocale: languages.source,
			sourcePath: source.path,
			sourceHash: sourceHash(source.raw),
			translationSchemaVersion: 'manual-v1',
			translationSource: 'manual',
			translatedAt: new Date().toISOString()
		};
		delete data.translationContentHash;
		let raw = matter.stringify(draft.content, data);
		const translated = matter(raw);
		const errors = [
			...(await postErrors(root, translated)),
			...translationErrors(source, translated, locale, languages.source, false)
		];
		if (errors.length) throw new Error(errors.join('; '));
		data.translationContentHash = translationHash(translated);
		raw = matter.stringify(draft.content, data);
		// Recheck immediately before writing: a concurrent edit must not certify an old source.
		if (sourceHash((await readPost(root, source.path)).raw) !== values['source-hash'])
			throw new Error('Source changed while accepting translation');
		const target = `content/translations/${locale}/posts/${slug}.md`;
		await writeContent(root, target, raw);
		output({
			stage: 'translation-accepted',
			path: target,
			sourceHash: data.sourceHash,
			next: 'status'
		});
	} else if (command === 'status' || command === 'check') {
		const report = await inspect(root, process.env);
		if (slug) {
			validSlug(slug);
			report.posts = report.posts.filter((post) => post.slug === slug);
			if (!report.posts.length) throw new Error(`Unknown post: ${slug}`);
		}
		output(report);
		if (command === 'check' && !report.ok) process.exitCode = 1;
	} else if (command === 'verify') {
		output(await verify());
	} else if (command === 'deploy') {
		// Deploy only a reviewed, committed snapshot. Never stage, commit, reset or force-push.
		if (run('git', ['status', '--porcelain']))
			throw new Error('Commit and review all changes before deploy');
		if (run('git', ['branch', '--show-current']) !== 'main')
			throw new Error('deploy must run on main; use a PR for other branches');
		const repository = githubRepository();
		const repo = JSON.parse(
			run('gh', ['repo', 'view', repository, '--json', 'isTemplate,defaultBranchRef'])
		);
		if (repo.isTemplate || repo.defaultBranchRef?.name !== 'main')
			throw new Error('Deploy from a personal non-template blog with main as the default branch');
		run(process.execPath, ['scripts/setup.mjs', 'check']);
		run(process.execPath, ['scripts/setup.mjs', 'pages-status']);
		const commit = run('git', ['rev-parse', 'HEAD']);
		await verify();
		if (
			run('git', ['status', '--porcelain']) ||
			run('git', ['rev-parse', 'HEAD']) !== commit ||
			githubRepository() !== repository
		)
			throw new Error('Checkout changed during verification; review and retry');
		run('git', ['push', 'origin', `${commit}:refs/heads/main`], true);
		output({
			stage: 'pushed',
			repository,
			commit,
			next: `npm run author:deploy-status -- ${commit}`,
			note: 'Push is not deployment success. If already pushed, inspect the existing run.'
		});
	} else if (command === 'deploy-status') {
		if (!/^[0-9a-f]{40}$/.test(slug ?? ''))
			throw new Error('deploy-status requires the full commit SHA returned by deploy');
		const repository = githubRepository();
		const runs = JSON.parse(
			run('gh', [
				'run',
				'list',
				'--repo',
				repository,
				'--workflow',
				'deploy.yml',
				'--commit',
				slug,
				'--branch',
				'main',
				'--event',
				'push',
				'--limit',
				'1',
				'--json',
				'databaseId'
			])
		);
		if (!runs.length)
			output({
				stage: 'awaiting-workflow',
				commit: slug,
				note: 'No matching push run found. Check Actions permissions and workflow triggers.'
			});
		else {
			const workflow = JSON.parse(
				run('gh', [
					'run',
					'view',
					String(runs[0].databaseId),
					'--repo',
					repository,
					'--json',
					'status,conclusion,url,headSha,jobs'
				])
			);
			const deploy = workflow.jobs.find((job) => job.name === 'deploy');
			output({
				stage:
					deploy?.conclusion === 'success'
						? 'deployed'
						: workflow.status === 'completed'
							? 'deployment-not-successful'
							: 'deploying',
				commit: slug,
				workflow,
				ingestion: 'not_verified',
				note: 'Registration success is not proof that GitBlog has finished collecting every locale. Check GitBlog separately.'
			});
		}
	} else throw new Error(`Unknown command: ${command}`);
} catch (error) {
	output({ ok: false, error: error.message });
	process.exitCode = 1;
}
