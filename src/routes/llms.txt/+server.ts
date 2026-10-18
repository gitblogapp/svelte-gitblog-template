import { llmsText } from '$lib/server/ai-discovery';
export const prerender = true;
export const trailingSlash = 'never';
export const GET = () =>
	new Response(llmsText(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
