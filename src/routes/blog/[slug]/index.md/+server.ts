import { sourceLocale } from '$lib/locales';
import { getSourcePostEntries } from '$lib/server/route-entries';
import { discoveryPolicy, markdownResponse } from '$lib/server/ai-discovery';
export const prerender = true;
export const trailingSlash = 'never';
export const entries = () => (discoveryPolicy().markdown ? getSourcePostEntries() : []);
export const GET = ({ params }: { params: { slug: string } }) =>
	markdownResponse(sourceLocale, params.slug);
