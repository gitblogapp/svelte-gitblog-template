import { readFile, rm } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import { locales, safePath, writeContent } from './authoring.mjs';
import { siteAddress, defaultPagesUrl } from './site-config.mjs';

export const setupKeys = [
	'PUBLIC_SITE_TITLE',
	'PUBLIC_SITE_URL',
	'PUBLIC_SITE_REPOSITORY',
	'PUBLIC_SOURCE_LOCALE',
	'PUBLIC_TRANSLATION_LOCALES',
	'PUBLIC_GISCUS_REPO',
	'PUBLIC_GISCUS_REPO_ID',
	'PUBLIC_GISCUS_CATEGORY_ID',
	'PUBLIC_GISCUS_CATEGORY'
];
const intentKeys = [
	'PUBLIC_SITE_TITLE',
	'PUBLIC_SITE_URL',
	'PUBLIC_SOURCE_LOCALE',
	'PUBLIC_TRANSLATION_LOCALES'
];
const templateRepository = 'gitblogapp/svelte-gitblog-template';
export const command = (root, bin, args, input) => {
	const result = spawnSync(bin, args, {
		cwd: root,
		encoding: 'utf8',
		input,
		timeout: 30000,
		maxBuffer: 4 * 1024 * 1024
	});
	if (result.error || result.status !== 0) {
		const error = new Error(
			`${bin} failed. ${bin === 'gh' ? 'Check gh auth status and repository permissions.' : 'Check the origin push URL.'}`
		);
		error.notFound = /HTTP 404/.test(result.stderr ?? '');
		throw error;
	}
	return result.stdout.trim();
};
export function originRepository(root) {
	const value = command(root, 'git', ['remote', 'get-url', '--push', '--all', 'origin']);
	const match = value.match(
		/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w-]+\/[\w.-]+?)(?:\.git)?$/
	);
	if (!match) throw new Error('Use one github.com origin push URL without embedded credentials');
	return match[1];
}
export function githubClient(root) {
	return async (endpoint, method = 'GET', body) => {
		const args = ['api', '--hostname', 'github.com', endpoint, '--method', method];
		if (body !== undefined) args.push('--input', '-');
		const result = command(root, 'gh', args, body === undefined ? undefined : JSON.stringify(body));
		return result ? JSON.parse(result) : null;
	};
}
async function readOptional(root, relative) {
	try {
		return await readFile(await safePath(root, relative), 'utf8');
	} catch (error) {
		if (error.code === 'ENOENT') return '';
		throw error;
	}
}
export async function readSettings(root) {
	const raw = await readOptional(root, '.env.production');
	const stateRaw = await readOptional(root, '.gitblog/setup.json');
	const state = stateRaw ? JSON.parse(stateRaw) : {};
	if (stateRaw && state.schemaVersion !== 1)
		throw new Error('Unsupported .gitblog/setup.json version');
	return { raw, env: parseEnv(raw), state };
}
const pick = (env) => Object.fromEntries(setupKeys.map((key) => [key, env[key] ?? '']));
function validateAnswers(answers) {
	if (!answers || typeof answers !== 'object' || Array.isArray(answers))
		throw new Error('Answers must be a JSON object');
	for (const [key, value] of Object.entries(answers)) {
		if (![...setupKeys, 'comments'].includes(key))
			throw new Error(`Unsupported setup key: ${key}. Never put credentials in the answers file.`);
		if (typeof value !== 'string' || /[\r\n]/.test(value) || value.includes(String.fromCharCode(0)))
			throw new Error(`${key} must be a single-line string`);
	}
	if (answers.comments !== undefined && !['enabled', 'disabled'].includes(answers.comments))
		throw new Error('comments must be enabled or disabled');
}
export function validateSettings(env, repository) {
	const errors = [];
	for (const key of [
		'PUBLIC_SITE_TITLE',
		'PUBLIC_SITE_URL',
		'PUBLIC_SITE_REPOSITORY',
		'PUBLIC_SOURCE_LOCALE'
	])
		if (!env[key]?.trim()) errors.push(`${key} is required`);
	if (env.PUBLIC_TRANSLATION_LOCALES === undefined)
		errors.push(
			'PUBLIC_TRANSLATION_LOCALES must be explicit; use an empty value for no translations'
		);
	if (env.PUBLIC_SITE_REPOSITORY?.toLowerCase() !== repository.toLowerCase())
		errors.push('PUBLIC_SITE_REPOSITORY must match the origin push repository');
	if (repository.toLowerCase() === templateRepository)
		errors.push('Create your own repository from the template before launch');
	try {
		const address = siteAddress(env.PUBLIC_SITE_URL);
		if (address.host === 'blog.gitblog.app')
			errors.push('Replace the template PUBLIC_SITE_URL with your own Pages URL or domain');
		if (!address.cname && address.url !== defaultPagesUrl(repository))
			errors.push(`The GitHub Pages URL for this repository is ${defaultPagesUrl(repository)}`);
		if (address.cname && address.base)
			errors.push(
				'A custom domain assigned to this repository must use the domain root, without a path'
			);
	} catch (error) {
		errors.push(error.message);
	}
	try {
		const { source, targets } = locales(env);
		for (const locale of [source, ...targets]) Intl.getCanonicalLocales(locale);
	} catch (error) {
		errors.push(`Invalid language configuration: ${error.message}`);
	}
	const giscus = ['PUBLIC_GISCUS_REPO', 'PUBLIC_GISCUS_REPO_ID', 'PUBLIC_GISCUS_CATEGORY_ID'];
	if (giscus.some((key) => env[key]?.trim())) {
		for (const key of giscus)
			if (!env[key]?.trim()) errors.push(`${key} is required when comments are enabled`);
		if (env.PUBLIC_GISCUS_REPO?.toLowerCase() !== repository.toLowerCase())
			errors.push(
				'Use the blog repository for comments; the workflow token cannot sync another repository'
			);
	}
	return errors;
}
export async function checkSetup(root, repository = originRepository(root)) {
	const { env } = await readSettings(root);
	const errors = validateSettings(env, repository);
	let address;
	try {
		address = siteAddress(env.PUBLIC_SITE_URL);
		const cname = (await readOptional(root, 'static/CNAME')).trim();
		if (cname !== (address.cname ?? ''))
			errors.push('static/CNAME does not match PUBLIC_SITE_URL; run site:configure');
	} catch {
		/* Reported by validateSettings. */
	}
	return {
		ok: errors.length === 0,
		errors,
		repository,
		address,
		next: errors.length ? 'npm run site:setup' : 'npm run site:pages:status'
	};
}
export async function repositoryInfo(repository, api) {
	const repo = await api(`repos/${repository}`);
	if (repo.is_template || repository.toLowerCase() === templateRepository)
		throw new Error('Create your own repository from the template before launch');
	if (repo.default_branch !== 'main')
		throw new Error('The launch workflow requires main as the default branch');
	return repo;
}
export async function getPages(repository, api) {
	try {
		return await api(`repos/${repository}/pages`);
	} catch (error) {
		if (error.notFound) return null;
		throw error;
	}
}
export async function inspectSetup(
	root,
	answers = {},
	api = githubClient(root),
	repository = originRepository(root)
) {
	validateAnswers(answers);
	const original = await readSettings(root);
	const proposed = { ...pick(original.env), ...answers };
	delete proposed.comments;
	const questions = [];
	const warnings = [];
	const errors = [];
	const ask = (key, prompt, suggested = '', options) =>
		questions.push({ key, prompt, suggested, ...(options ? { options } : {}) });
	const repo = await repositoryInfo(repository, api);
	let pages;
	try {
		pages = await getPages(repository, api);
	} catch {
		warnings.push(
			'Could not read Pages settings. Check Pages permissions before configuring deployment.'
		);
	}
	proposed.PUBLIC_SITE_REPOSITORY = repository;
	if (
		answers.PUBLIC_SITE_REPOSITORY &&
		answers.PUBLIC_SITE_REPOSITORY.toLowerCase() !== repository.toLowerCase()
	)
		errors.push('The requested repository does not match origin');
	const suggested = {
		PUBLIC_SITE_TITLE:
			proposed.PUBLIC_SITE_TITLE && proposed.PUBLIC_SITE_TITLE !== 'GitBlog'
				? proposed.PUBLIC_SITE_TITLE
				: repo.name,
		PUBLIC_SITE_URL:
			proposed.PUBLIC_SITE_URL && proposed.PUBLIC_SITE_URL !== 'https://blog.gitblog.app'
				? proposed.PUBLIC_SITE_URL
				: pages?.html_url || defaultPagesUrl(repository),
		PUBLIC_SOURCE_LOCALE: proposed.PUBLIC_SOURCE_LOCALE || 'en',
		PUBLIC_TRANSLATION_LOCALES: proposed.PUBLIC_TRANSLATION_LOCALES
	};
	const prompts = {
		PUBLIC_SITE_TITLE: 'What should the public blog title be?',
		PUBLIC_SITE_URL:
			'Use the suggested GitHub Pages address or a custom domain you control? Provide the final HTTPS URL.',
		PUBLIC_SOURCE_LOCALE: 'Which language will the original posts use?',
		PUBLIC_TRANSLATION_LOCALES:
			'Which translation languages should be published? Use a comma-separated list, or an empty string for none.'
	};
	for (const key of intentKeys) {
		if (answers[key] === undefined && original.state.confirmed?.[key] !== proposed[key])
			ask(key, prompts[key], suggested[key]);
	}
	let comments = answers.comments ?? original.state.comments;
	if (!comments) {
		if (proposed.PUBLIC_GISCUS_REPO_ID && proposed.PUBLIC_GISCUS_CATEGORY_ID) comments = 'enabled';
		else ask('comments', 'Enable comments for this blog?', 'enabled', ['enabled', 'disabled']);
	}
	const enableDiscussions = comments === 'enabled' && !repo.has_discussions;
	if (comments === 'disabled') {
		for (const key of setupKeys.filter((key) => key.startsWith('PUBLIC_GISCUS_')))
			proposed[key] = '';
	} else if (comments === 'enabled') {
		warnings.push(
			'Comment provider App access is not verified. gh/PAT access and Discussions activation do not authorize the provider App. Follow docs/gitblog/setup.md#verify-the-comment-provider before reporting comments ready.'
		);
		proposed.PUBLIC_GISCUS_REPO = repository;
		proposed.PUBLIC_GISCUS_REPO_ID = repo.node_id;
		if (
			answers.PUBLIC_GISCUS_REPO &&
			answers.PUBLIC_GISCUS_REPO.toLowerCase() !== repository.toLowerCase()
		)
			errors.push('Comments must use the blog repository');
		if (answers.PUBLIC_GISCUS_REPO_ID && answers.PUBLIC_GISCUS_REPO_ID !== repo.node_id)
			errors.push('PUBLIC_GISCUS_REPO_ID does not match the GitHub repository node ID');
		if (repo.private)
			errors.push(
				'Giscus requires a public repository; change visibility yourself or disable comments'
			);
		if (repo.has_discussions) {
			const [owner, name] = repository.split('/');
			const result = await api('graphql', 'POST', {
				query:
					'query($owner:String!,$name:String!){repository(owner:$owner,name:$name){discussionCategories(first:100){nodes{id name slug} pageInfo{hasNextPage}}}}',
				variables: { owner, name }
			});
			if (result.errors?.length || !result.data?.repository)
				throw new Error(
					'Could not query discussion categories. Check gh authentication and Discussions access.'
				);
			const collection = result.data.repository.discussionCategories;
			if (collection.pageInfo.hasNextPage)
				throw new Error(
					'More than 100 discussion categories; narrow the repository configuration before setup'
				);
			const categories = collection.nodes;
			const explicitId = answers.PUBLIC_GISCUS_CATEGORY_ID;
			const explicitName = answers.PUBLIC_GISCUS_CATEGORY;
			const category = explicitId
				? categories.find((row) => row.id === explicitId)
				: explicitName
					? categories.find((row) => row.name === explicitName || row.slug === explicitName)
					: (categories.find((row) => row.id === proposed.PUBLIC_GISCUS_CATEGORY_ID) ??
						categories.find((row) => row.slug === 'announcements') ??
						(categories.length === 1 ? categories[0] : undefined));
			if (
				explicitId &&
				explicitName &&
				category &&
				category.name !== explicitName &&
				category.slug !== explicitName
			)
				errors.push('The category name and ID refer to different categories');
			if (category) {
				proposed.PUBLIC_GISCUS_CATEGORY_ID = category.id;
				proposed.PUBLIC_GISCUS_CATEGORY = category.name;
			} else {
				if (explicitId || explicitName)
					errors.push('The selected discussion category does not belong to this repository');
				ask(
					'PUBLIC_GISCUS_CATEGORY_ID',
					'Choose the discussion category for comments; create one in GitHub if none exists.',
					'',
					categories
				);
			}
		}
		warnings.push(
			'Confirm the configured comment provider is installed/authorized for this repository. Repository/category lookup does not verify the app installation.'
		);
	}
	if (!questions.length) {
		// Category IDs cannot be resolved until Discussions is enabled. Validate all other settings first.
		const validationValues = { ...proposed };
		if (enableDiscussions)
			for (const key of setupKeys.filter((key) => key.startsWith('PUBLIC_GISCUS_')))
				validationValues[key] = '';
		errors.push(...validateSettings(validationValues, repository));
	}
	return {
		schemaVersion: 1,
		stage: errors.length
			? 'blocked'
			: questions.length
				? 'needs_input'
				: enableDiscussions
					? 'needs_discussions'
					: 'ready',
		repository,
		proposed,
		comments,
		commentsIntegration: {
			status:
				comments === 'enabled'
					? 'not_verified'
					: comments === 'disabled'
						? 'disabled'
						: 'not_configured',
			guide: 'docs/gitblog/github-app.md',
			next: comments === 'enabled' ? 'npm run site:app:status' : null
		},
		discussions: {
			enabled: Boolean(repo.has_discussions),
			enableRequired: enableDiscussions,
			settingsUrl: `https://github.com/${repository}/settings`
		},
		questions,
		errors,
		warnings,
		changes: setupKeys
			.filter((key) => proposed[key] !== (original.env[key] ?? ''))
			.map((key) => ({ key, before: original.env[key] ?? '', after: proposed[key] })),
		pages: {
			current: pages
				? { url: pages.html_url, cname: pages.cname, buildType: pages.build_type }
				: null,
			settingsUrl: `https://github.com/${repository}/settings/pages`
		}
	};
}
// Keep unrelated settings and comments byte-for-byte. Setup only accepts literal public values.
function serializeValue(value) {
	if (/[\r\n\\$`]/.test(value) || value.includes(String.fromCharCode(0)))
		throw new Error(
			'Setup values must be literal single-line text without backslashes, dollar signs, or backticks'
		);
	if (!value.includes('"')) return `"${value}"`;
	if (!value.includes("'")) return `'${value}'`;
	throw new Error('A setup value cannot contain both single and double quotes');
}
export function patchSettings(raw, values) {
	const newline = raw.includes('\r\n') ? '\r\n' : '\n';
	let result = raw;
	for (const [key, value] of Object.entries(values)) {
		const expression = new RegExp(`^[ \t]*(?:export\\s+)?${key}\\s*=.*$`, 'gm');
		const matches = [...result.matchAll(expression)];
		if (matches.length > 1) throw new Error(`Duplicate ${key} entries; resolve them before setup`);
		const line = `${key}=${serializeValue(value)}`;
		result = matches.length
			? result.replace(expression, () => line + (matches[0][0].endsWith('\r') ? '\r' : ''))
			: result + (result && !result.endsWith('\n') ? newline : '') + line + newline;
	}
	return result;
}
export async function applySetup(
	root,
	answers,
	api = githubClient(root),
	repository = originRepository(root)
) {
	const before = await readSettings(root);
	let plan = await inspectSetup(root, answers, api, repository);
	if (!['ready', 'needs_discussions'].includes(plan.stage)) return { ...plan, applied: false };
	// Check local serialization and paths before making a remote change.
	patchSettings(before.raw, plan.proposed);
	await safePath(root, 'static/CNAME');
	await safePath(root, '.gitblog/setup.json');
	const checkUnchanged = async () => {
		const current = await readSettings(root);
		if (
			current.raw !== before.raw ||
			JSON.stringify(current.state) !== JSON.stringify(before.state)
		)
			throw new Error('Local settings changed during setup; inspect again');
	};
	await checkUnchanged();
	if (plan.discussions.enableRequired) {
		try {
			await api(`repos/${repository}`, 'PATCH', { has_discussions: true });
		} catch {
			throw new Error(
				'Could not enable Discussions. Check gh auth status and repository Administration write permission, or enable Discussions in Settings → General, then rerun site:configure. Local settings were not written.'
			);
		}
		const refreshed = await repositoryInfo(repository, api);
		if (!refreshed.has_discussions)
			throw new Error(
				'GitHub did not confirm Discussions activation. Rerun site:setup; local settings were not written.'
			);
		// Discover real categories after activation; ambiguous choices remain questions.
		plan = await inspectSetup(root, answers, api, repository);
		if (plan.stage !== 'ready') return { ...plan, applied: false };
	}
	const raw = patchSettings(before.raw, plan.proposed);
	const address = siteAddress(plan.proposed.PUBLIC_SITE_URL);
	await checkUnchanged();
	await writeContent(root, '.env.production', raw);
	if (address.cname) await writeContent(root, 'static/CNAME', `${address.cname}\n`);
	else await rm(await safePath(root, 'static/CNAME'), { force: true });
	await writeContent(
		root,
		'.gitblog/setup.json',
		JSON.stringify(
			{
				schemaVersion: 1,
				comments: plan.comments,
				confirmed: Object.fromEntries(intentKeys.map((key) => [key, plan.proposed[key]]))
			},
			null,
			2
		) + '\n'
	);
	return { ...plan, applied: true, next: 'npm run site:check && npm run site:pages' };
}
export function pagesReport(repository, env, pages) {
	const address = siteAddress(env.PUBLIC_SITE_URL);
	const configurationReady = Boolean(
		pages && pages.build_type === 'workflow' && (pages.cname || null) === address.cname
	);
	return {
		repository,
		configurationReady,
		expectedUrl: address.url,
		expectedCname: address.cname,
		actualCname: pages?.cname ?? null,
		buildType: pages?.build_type ?? null,
		httpsEnforced: pages?.https_enforced ?? false,
		certificateState: pages?.https_certificate?.state ?? 'unknown',
		dns: address.cname ? 'not_verified' : 'not_required',
		deployment: 'not_verified',
		ingestion: 'not_verified',
		dnsInstructions: address.cname
			? `Configure DNS for ${address.host} with your DNS provider. For a subdomain, use a CNAME record pointing to ${repository.split('/')[0].toLowerCase()}.github.io (no repository path). For an apex domain, follow GitHub's current A/AAAA or ALIAS/ANAME instructions.`
			: null,
		documentation:
			'https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site'
	};
}
export async function configurePages(
	root,
	{ write = false } = {},
	api = githubClient(root),
	repository = originRepository(root)
) {
	const check = await checkSetup(root, repository);
	if (!check.ok) throw new Error(check.errors.join('\n'));
	await repositoryInfo(repository, api);
	const { env } = await readSettings(root);
	let pages = await getPages(repository, api);
	if (write) {
		if (!pages) {
			await api(`repos/${repository}/pages`, 'POST', { build_type: 'workflow' });
			pages = await getPages(repository, api);
		}
		if (!pagesReport(repository, env, pages).configurationReady) {
			await api(`repos/${repository}/pages`, 'PUT', {
				build_type: 'workflow',
				cname: siteAddress(env.PUBLIC_SITE_URL).cname
			});
		}
		pages = await getPages(repository, api);
		if (pages?.https_certificate?.state === 'approved' && !pages.https_enforced) {
			await api(`repos/${repository}/pages`, 'PUT', { https_enforced: true });
			pages = await getPages(repository, api);
		}
	}
	return pagesReport(repository, env, pages);
}
