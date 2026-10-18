import { discoveryManifest } from '$lib/server/ai-discovery';
export const prerender = true;
export const trailingSlash = 'never';
export const GET = () => Response.json(discoveryManifest());
