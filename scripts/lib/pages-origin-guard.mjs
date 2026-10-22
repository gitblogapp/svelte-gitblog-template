// Shared with GitBlog's connection controller. The generated Worker contains
// public verification material only; the signing key stays in gitblog-proxy.
export function pagesOriginGuard(config, { request = fetch, now = Date.now } = {}) {
	const { hostname, token, origin } = config;
	if (
		!/^[a-z0-9-]+\.gitblog\.page$/.test(hostname) ||
		!token ||
		!/^[a-z0-9-]+\.pages\.dev$/.test(origin?.hostname) ||
		origin.publicKey?.kty !== 'OKP' ||
		origin.publicKey?.crv !== 'Ed25519' ||
		origin.publicKey?.d
	)
		throw new Error('Invalid GitBlog origin configuration');
	let publicKey, state, pending;
	async function signed(req) {
		try {
			const stamp = req.headers.get('x-gitblog-origin-time') || '';
			const encoded = req.headers.get('x-gitblog-origin-signature') || '';
			if (
				!/^\d{10,12}$/.test(stamp) ||
				Math.abs(now() / 1000 - Number(stamp)) > 60 ||
				encoded.length !== 88
			)
				return false;
			publicKey ||= crypto.subtle.importKey('jwk', origin.publicKey, 'Ed25519', false, ['verify']);
			const url = new URL(req.url);
			const payload = JSON.stringify([
				'gitblog-origin-v1',
				hostname,
				token,
				req.method,
				url.origin,
				url.pathname + url.search,
				stamp
			]);
			return await crypto.subtle.verify(
				'Ed25519',
				await publicKey,
				Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
				new TextEncoder().encode(payload)
			);
		} catch {
			return false;
		}
	}
	async function active() {
		if (state && state.until > now()) return state.active;
		pending ||= (async () => {
			const res = await request(`https://control.gitblog.page/v1/origins/${hostname}`, {
				redirect: 'manual',
				signal: AbortSignal.timeout(5000),
				headers: { accept: 'application/json' }
			});
			if (!res.ok) throw new Error('Domain state unavailable');
			const data = await res.json();
			if (typeof data.active !== 'boolean') throw new Error('Invalid domain state');
			const enabled =
				data.active &&
				data.hostname === hostname &&
				data.origin === origin.hostname &&
				data.token === token &&
				data.validUntil > now();
			state = {
				active: enabled,
				until: Math.min(now() + 15000, enabled ? data.validUntil : Infinity)
			};
			return enabled;
		})().finally(() => {
			pending = undefined;
		});
		return pending;
	}
	async function assets(req, env, preview, authenticated = false) {
		const response = await env.ASSETS.fetch(req);
		const headers = new Headers(response.headers);
		if (authenticated) {
			headers.set('x-gitblog-origin-response', 'signed-v1');
			headers.set(
				'x-gitblog-origin-cache-control',
				headers.get('cache-control') || 'public, max-age=60'
			);
		}
		// Never let a signed 200 be cached as the response to an unsigned request.
		headers.set('cache-control', 'no-store');
		if (preview) headers.set('x-robots-tag', 'noindex');
		return new Response(response.body, { status: response.status, headers });
	}
	return {
		async fetch(req, env) {
			const url = new URL(req.url);
			if (!['GET', 'HEAD'].includes(req.method))
				return new Response(null, {
					status: 405,
					headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' }
				});
			// Deployment/branch previews stay usable, but must not compete in search.
			if (url.hostname.endsWith(`.${origin.hostname}`)) return assets(req, env, true);
			if (url.hostname !== origin.hostname)
				return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
			if (await signed(req)) return assets(req, env, false, true);
			try {
				// Pending/disconnected assignments retain their working default URL.
				if (!(await active())) return assets(req, env, false);
				url.protocol = 'https:';
				url.hostname = hostname;
				url.port = '';
				return new Response(null, {
					status: 301,
					headers: { location: url.href, 'cache-control': 'public, max-age=60' }
				});
			} catch {
				return new Response('Blog connection is being verified', {
					status: 503,
					headers: { 'cache-control': 'no-store', 'retry-after': '30', 'x-robots-tag': 'noindex' }
				});
			}
		}
	};
}

export const originGuardMarker = '// gitblog-managed-origin-redirect-v1';
export function originGuardSource(proof) {
	// Validate before generating an artifact, not just at the first live request.
	pagesOriginGuard(proof);
	return `${originGuardMarker}\nexport default (${pagesOriginGuard.toString()})(${JSON.stringify(proof)});\n`;
}
