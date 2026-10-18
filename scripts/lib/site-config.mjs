// Shared by setup, SvelteKit, and the final Pages artifact writer.
export function siteAddress(value) {
	let url;
	try {
		url = new URL(value);
	} catch {
		throw new Error('PUBLIC_SITE_URL must be an absolute HTTPS URL');
	}
	if (
		url.protocol !== 'https:' ||
		url.username ||
		url.password ||
		url.port ||
		url.search ||
		url.hash
	)
		throw new Error('PUBLIC_SITE_URL must use HTTPS without credentials, port, query, or fragment');
	if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/i.test(url.hostname))
		throw new Error('PUBLIC_SITE_URL must use a public domain name');
	const base = url.pathname.replace(/\/+$/, '');
	if (base && !/^\/[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*$/.test(base))
		throw new Error('PUBLIC_SITE_URL contains an unsupported path');
	const githubPages = url.hostname.endsWith('.github.io');
	return {
		url: `${url.origin}${base}`,
		host: url.hostname,
		base,
		cname: githubPages ? null : url.hostname
	};
}

export function defaultPagesUrl(repository) {
	const [owner, name] = repository.split('/');
	return `https://${owner.toLowerCase()}.github.io${name.toLowerCase() === `${owner.toLowerCase()}.github.io` ? '' : `/${name}`}`;
}

export function pagesBase(env, fallbackUrl) {
	if (env.SITE_BASE_PATH !== undefined)
		return env.SITE_BASE_PATH === '/'
			? ''
			: `/${env.SITE_BASE_PATH.replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '');
	const url = env.PUBLIC_SITE_URL || fallbackUrl;
	return url ? siteAddress(url).base : '';
}
