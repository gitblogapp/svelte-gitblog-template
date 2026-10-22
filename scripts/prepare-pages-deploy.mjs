import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import { deploymentConfig } from './lib/deployment-config.mjs';
import { originGuardMarker, originGuardSource } from './lib/pages-origin-guard.mjs';
import { primaryDomainMarker, primaryDomainSource } from './lib/pages-primary-domain.mjs';

async function optional(path) {
	try {
		return await readFile(path, 'utf8');
	} catch (e) {
		if (e.code === 'ENOENT') return '';
		throw e;
	}
}
export async function preparePagesDeploy(directory, settings, token, request = fetch) {
	const config = deploymentConfig(settings);
	if (config.provider !== 'cloudflare') return;
	if (!token || /\s/.test(token)) throw new Error('Cloudflare Pages API token is required');
	const root = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/pages/projects/${config.projectName}`;
	async function api(path, body) {
		const response = await request(root + path, {
			method: body ? 'PATCH' : 'GET',
			body: body ? JSON.stringify(body) : undefined,
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			redirect: 'manual',
			signal: AbortSignal.timeout(15000)
		});
		if (!response.ok) throw new Error('Cannot verify Cloudflare Pages domain readiness');
		const value = await response.json();
		if (!value.success) throw new Error('Cannot verify Cloudflare Pages domain readiness');
		return value.result;
	}
	const project = await api('');
	if (!/^[a-z0-9-]+\.pages\.dev$/.test(project.subdomain) || project.name !== config.projectName)
		throw new Error('Unexpected Cloudflare Pages project');
	const primary = new URL(config.siteUrl).hostname;
	const workerPath = join(directory, '_worker.js'),
		redirectsPath = join(directory, '_redirects');
	const previousWorker = await optional(workerPath),
		previousRedirects = await optional(redirectsPath);
	const managed =
		previousWorker.startsWith(originGuardMarker) || previousWorker.startsWith(primaryDomainMarker);
	const routesPath = join(directory, '_routes.json'),
		routes = await optional(routesPath);
	const managedRoutes =
		JSON.stringify({
			version: 1,
			include: ['/*'],
			exclude: [],
			description: 'gitblog-managed-primary-domain-v1'
		}) + '\n';
	// Keep user-authored rules byte-for-byte outside our delimited section.
	const redirects = previousRedirects.replace(
		/# gitblog-managed-primary-domain-start\n[\s\S]*?# gitblog-managed-primary-domain-end\n?/g,
		''
	);
	const nextRedirects = redirects;
	if (primary !== project.subdomain && previousRedirects.trim())
		throw new Error('Integrate custom _redirects with primary-domain routing before deployment');
	if (primary !== project.subdomain && routes && routes !== managedRoutes)
		throw new Error('Custom _routes.json conflicts with primary-domain routing');
	if (primary === project.subdomain) {
		if (managed) await rm(workerPath);
		if (routes === managedRoutes) await rm(routesPath);
	} else if (/^[a-z0-9-]+\.gitblog\.page$/.test(primary)) {
		const proof = JSON.parse(
			await readFile(join(directory, '.well-known/gitblog-proxy.json'), 'utf8')
		);
		if (proof.hostname !== primary || proof.origin?.hostname !== project.subdomain)
			throw new Error('Connect this GitBlog address before deploying');
		if (previousWorker && !managed)
			throw new Error('Custom _worker.js conflicts with GitBlog origin routing');
		await writeFile(workerPath, originGuardSource(proof));
	} else {
		if (primary.endsWith('.pages.dev'))
			throw new Error('The default URL must match this Pages project');
		const domain = await api(`/domains/${primary}`);
		if (domain.name !== primary || domain.status !== 'active')
			throw new Error(
				'Activate the custom domain and its certificate before using it as the primary URL'
			);
		if (previousWorker && !managed)
			throw new Error('Custom _worker.js must implement its own primary-domain redirects');
		const domains = await api('/domains');
		if (!Array.isArray(domains)) throw new Error('Cannot verify attached domain aliases');
		const aliases = domains
			.filter((d) => d.status === 'active' && d.name !== primary)
			.map((d) => d.name);
		await writeFile(
			workerPath,
			primaryDomainSource({ primary, origin: project.subdomain, aliases })
		);
	}
	if (primary !== project.subdomain) {
		// Do not silently expose the duplicate static site on Function exhaustion.
		if (
			project.deployment_configs?.production?.fail_open !== false ||
			project.deployment_configs?.preview?.fail_open !== false
		)
			await api('', {
				deployment_configs: { production: { fail_open: false }, preview: { fail_open: false } }
			});
		// Advanced mode guards every request, including feeds and Markdown exports.
		await writeFile(routesPath, managedRoutes);
	}
	if (nextRedirects) await writeFile(redirectsPath, nextRedirects);
	else if (previousRedirects) await rm(redirectsPath);
	return { primary, defaultHostname: project.subdomain };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	try {
		const settings = parseEnv(await readFile('.env.production', 'utf8'));
		await preparePagesDeploy(
			resolve(process.argv[2] || 'build'),
			settings,
			process.env.CLOUDFLARE_API_TOKEN
		);
		console.log('Primary-domain routing verified.');
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
