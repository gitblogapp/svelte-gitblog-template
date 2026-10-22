// Executed only by the pinned official reusable workflow. Never execute blog code here.
import { parseEnv } from 'node:util';
export const templateRepository = 'gitblogapp/svelte-gitblog-template';
export async function registerBlog(
	env = process.env,
	request = fetch,
	pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
) {
	const hub = new URL(env.GITBLOG_HUB_URL || 'https://gitblog.app');
	if (
		hub.protocol !== 'https:' ||
		hub.username ||
		hub.password ||
		hub.pathname !== '/' ||
		hub.search ||
		hub.hash
	)
		throw new Error('A public HTTPS GitBlog origin is required');
	const repository = env.GITHUB_REPOSITORY || '';
	if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) throw new Error('Invalid repository');
	const api = async (path, optional = false) => {
		const response = await request(`https://api.github.com${path}`, {
			redirect: 'manual',
			signal: AbortSignal.timeout(10000),
			headers: {
				Authorization: `Bearer ${env.GITHUB_TOKEN}`,
				Accept: 'application/vnd.github+json',
				'User-Agent': 'gitblog-registration'
			}
		});
		if (optional && response.status === 404) return null;
		if (!response.ok) throw new Error(`GitHub verification failed (${response.status})`);
		return response.json();
	};
	const repo = await api(`/repos/${repository}`);
	if (
		String(repo.id) !== env.GITHUB_REPOSITORY_ID ||
		repo.full_name.toLowerCase() !== repository.toLowerCase() ||
		repo.private ||
		repo.archived ||
		repo.is_template ||
		env.GITHUB_REF !== `refs/heads/${repo.default_branch}` ||
		![repo.template_repository, repo.parent, repo.source].some(
			(item) => item?.full_name?.toLowerCase() === templateRepository
		)
	)
		throw new Error('A public blog from the official template on its default branch is required');
	const commit = env.GITBLOG_DEPLOYED_COMMIT || '';
	if (commit && !/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid deployed commit');
	// Read configuration as data at the deployed commit. Never checkout or execute it.
	const file = await api(
		`/repos/${repository}/contents/.env.production?ref=${commit || encodeURIComponent(repo.default_branch)}`,
		true
	);
	let settings = {};
	if (file) {
		if (
			file.type !== 'file' ||
			file.encoding !== 'base64' ||
			file.size > 64000 ||
			typeof file.content !== 'string' ||
			file.content.length > 90000
		)
			throw new Error('Invalid deployment settings');
		settings = parseEnv(Buffer.from(file.content, 'base64').toString('utf8'));
	}
	const provider = settings.GITBLOG_DEPLOY_PROVIDER || 'github';
	if (!['github', 'cloudflare'].includes(provider)) throw new Error('Invalid deployment provider');
	const site = new URL(
		provider === 'cloudflare'
			? settings.PUBLIC_SITE_URL
			: (await api(`/repos/${repository}/pages`)).html_url
	);
	if (
		site.protocol !== 'https:' ||
		site.username ||
		site.password ||
		site.port ||
		site.search ||
		site.hash
	)
		throw new Error('Invalid Pages address');
	if (provider === 'cloudflare' && site.pathname !== '/')
		throw new Error('Cloudflare Pages requires an origin URL');
	const oidcUrl = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
	oidcUrl.searchParams.set('audience', `${hub.origin}/ingestion`);
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			const identity = await request(oidcUrl, {
				redirect: 'manual',
				signal: AbortSignal.timeout(10000),
				headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` }
			});
			if (!identity.ok) throw new Error('Could not authenticate this workflow');
			const { value: token } = await identity.json();
			if (typeof token !== 'string' || !token) throw new Error('Missing workflow identity');
			const response = await request(new URL('/v1/ingestion/deploy-hint', hub), {
				method: 'POST',
				redirect: 'manual',
				signal: AbortSignal.timeout(20000),
				headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					repositoryId: repo.id,
					repository: repo.full_name,
					siteUrl: site.href,
					commitSha: commit
				})
			});
			if (response.ok) {
				console.log('GitBlog accepted registration and feed refresh.');
				return;
			}
			if ([400, 401, 403, 422].includes(response.status))
				throw Object.assign(new Error(`GitBlog rejected registration (${response.status})`), {
					permanent: true
				});
			throw new Error(`GitBlog registration unavailable (${response.status})`);
		} catch (cause) {
			if (cause?.permanent || attempt === 3) throw cause;
			await pause([2000, 5000, 10000][attempt]);
		}
	}
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
	try {
		await registerBlog();
	} catch {
		console.error(
			'GitBlog registration failed. Your blog remains deployed. Retry the Sync GitBlog feed workflow from Actions.'
		);
		process.exitCode = 1;
	}
}
