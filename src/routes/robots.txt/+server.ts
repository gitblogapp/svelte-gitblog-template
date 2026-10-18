import { getSiteConfig } from '$lib/site';
import { sourceLocale } from '$lib/locales';
import { env } from '$env/dynamic/public';
import { aiPolicy, robotsText } from '$lib/template/ai-policy';

export const prerender = true;
export const trailingSlash = 'never';

const siteConfig = getSiteConfig(sourceLocale);

export const GET = () =>
	new Response(robotsText(aiPolicy(env), siteConfig.url), {
		headers: {
			'Cache-Control': 'max-age=0, s-maxage=3600',
			'Content-Type': 'text/plain; charset=utf-8'
		}
	});
