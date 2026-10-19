import { githubClient, originRepository, readSettings, repositoryInfo } from './setup.mjs';

export const appInstallUrl = 'https://github.com/apps/gitblog-app/installations/new';

// Use the provider's existing server-rendered widget contract. Only its backend has
// the App JWT needed to distinguish installation access from the author's gh/PAT.
// A changed/missing contract fails closed as unknown, never as "not installed".
export async function inspectAppAccess(
	root,
	{ api = githubClient(root), request = fetch, repository = originRepository(root) } = {}
) {
	const { env, state } = await readSettings(root);
	const report = {
		schemaVersion: 1,
		repository,
		app: 'gitblog-app',
		installUrl: appInstallUrl,
		guide: 'docs/gitblog/github-app.md',
		widget: 'not_verified'
	};
	const result = (status, ok, next) => ({ ...report, status, ok, next });
	if (
		['false', '0', 'off', 'no'].includes((env.PUBLIC_GISCUS_ENABLED ?? '').toLowerCase()) ||
		(state.comments === 'disabled' && !env.PUBLIC_GISCUS_REPO_ID && !env.PUBLIC_GISCUS_CATEGORY_ID)
	)
		return result(
			'disabled',
			true,
			'No App installation is required for hidden/disabled comments.'
		);
	const provider = env.PUBLIC_GISCUS_PROVIDER || 'gitblog';
	let host;
	if (provider === 'gitblog') {
		try {
			const url = new URL(env.PUBLIC_GISCUS_HOST);
			if (url.protocol !== 'https:' || url.username || url.password)
				throw new Error('Invalid host');
			host = url.origin;
		} catch {
			return result(
				'needs_configuration',
				false,
				'Configure a valid HTTPS GitBlog comment host before verification.'
			);
		}
	}
	if (provider !== 'gitblog' || host !== 'https://gitblog.app')
		return result(
			'external_provider',
			true,
			'Follow the configured provider installation guide and verify its live widget manually.'
		);
	if (
		env.PUBLIC_SITE_REPOSITORY?.toLowerCase() !== repository.toLowerCase() ||
		env.PUBLIC_GISCUS_REPO?.toLowerCase() !== repository.toLowerCase() ||
		!env.PUBLIC_GISCUS_REPO_ID ||
		!env.PUBLIC_GISCUS_CATEGORY_ID ||
		!env.PUBLIC_GISCUS_CATEGORY
	)
		return result('needs_configuration', false, 'Run npm run site:setup and site:configure first.');
	const repo = await repositoryInfo(repository, api);
	if (repo.private || repo.archived || !repo.has_discussions)
		return result(
			'needs_repository',
			false,
			'Use a public, active repository with Discussions enabled; rerun site:configure.'
		);
	if (
		repo.full_name?.toLowerCase() !== repository.toLowerCase() ||
		repo.node_id !== env.PUBLIC_GISCUS_REPO_ID
	)
		return result('needs_configuration', false, 'Repository identity changed; rerun site:setup.');
	// Probe App access on the owner's supported Pages origin, independently of DNS
	// and custom-domain authorization. The actual article still needs a browser check.
	const origin = `https://${repository.split('/')[0].toLowerCase()}.github.io`;
	const url = new URL('https://gitblog.app/widget');
	url.searchParams.set('repo', repository);
	url.searchParams.set('origin', origin);
	try {
		const response = await request(url, {
			redirect: 'error',
			signal: AbortSignal.timeout(20000),
			headers: { Accept: 'text/html' }
		});
		if (![200, 403].includes(response.status)) throw new Error('Provider unavailable');
		const html = await response.text();
		const data = html.match(/<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
		const payload = JSON.parse(data?.[1] ?? 'null');
		const props = payload?.props?.pageProps;
		if (
			payload?.page !== '/widget' ||
			props?.repo?.toLowerCase() !== repository.toLowerCase() ||
			props.origin !== `${origin}/`
		)
			throw new Error('Unrecognized provider response');
		if (
			response.status === 403 &&
			['installation', 'permissions', 'repository'].includes(props.setupIssue)
		)
			return result(
				`needs_${props.setupIssue}`,
				false,
				`Have the owner review ${appInstallUrl} for ${repository}, then rerun npm run site:app:status. See the guide for organization approval and permission requirements.`
			);
		if (response.status !== 200 || props.setupIssue !== null)
			throw new Error('Unrecognized provider response');
		return result(
			'accessible',
			true,
			'App access verified. After deployment, verify the real article widget, category and domain; do not claim comments fully ready yet.'
		);
	} catch {
		return result(
			'unknown',
			false,
			'Provider access could not be verified (network, rate limit, service error or changed response). Retry later or inspect the live widget. Do not infer missing installation or expand permissions from this result.'
		);
	}
}
