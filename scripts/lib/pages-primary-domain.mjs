export const primaryDomainMarker = '// gitblog-managed-primary-domain-v1';
export function primaryDomainWorker({ primary, origin, aliases = [] }) {
	if (
		!/^[a-z0-9-]+\.pages\.dev$/.test(origin) ||
		new URL(`https://${primary}`).hostname !== primary ||
		primary.endsWith('.pages.dev')
	)
		throw new Error('Invalid primary domain');
	return {
		async fetch(request, env) {
			const url = new URL(request.url);
			if (url.hostname === origin || aliases.includes(url.hostname)) {
				url.protocol = 'https:';
				url.hostname = primary;
				url.port = '';
				return new Response(null, {
					status: 301,
					headers: { location: url.href, 'cache-control': 'public, max-age=60' }
				});
			}
			const preview = url.hostname.endsWith(`.${origin}`);
			if (url.hostname !== primary && !preview) return new Response(null, { status: 404 });
			const response = await env.ASSETS.fetch(request);
			if (!preview) return response;
			const headers = new Headers(response.headers);
			headers.set('x-robots-tag', 'noindex');
			return new Response(response.body, { status: response.status, headers });
		}
	};
}
export function primaryDomainSource(config) {
	primaryDomainWorker(config);
	return `${primaryDomainMarker}\nexport default (${primaryDomainWorker.toString()})(${JSON.stringify(config)});\n`;
}
