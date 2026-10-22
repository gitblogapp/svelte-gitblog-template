export function deploymentConfig(env, { allowPending = false } = {}) {
	const provider = env.GITBLOG_DEPLOY_PROVIDER || 'github';
	if (!['github', 'cloudflare'].includes(provider))
		throw new Error('GITBLOG_DEPLOY_PROVIDER must be github or cloudflare');
	const accountId = env.CLOUDFLARE_ACCOUNT_ID || '';
	const projectName = env.CLOUDFLARE_PAGES_PROJECT || '';
	const siteUrl = env.PUBLIC_SITE_URL || '';
	const ready = provider === 'github' || Boolean(accountId && projectName && siteUrl);
	if (provider === 'cloudflare') {
		if (accountId && !/^[a-f0-9]{32}$/.test(accountId))
			throw new Error('Invalid CLOUDFLARE_ACCOUNT_ID');
		if (projectName && !/^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/.test(projectName))
			throw new Error('Invalid CLOUDFLARE_PAGES_PROJECT');
		if (siteUrl) {
			const url = new URL(siteUrl);
			if (
				url.protocol !== 'https:' ||
				url.username ||
				url.password ||
				url.port ||
				url.pathname !== '/' ||
				url.search ||
				url.hash ||
				url.hostname.endsWith('.github.io')
			)
				throw new Error('Cloudflare Pages requires an HTTPS origin without a path');
		}
		if (!ready && !allowPending)
			throw new Error('Complete Cloudflare account, project and site URL in deployment settings');
	}
	return { provider, accountId, projectName, siteUrl, ready };
}
