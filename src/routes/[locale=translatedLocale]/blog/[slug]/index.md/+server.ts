import { getTranslatedPostEntries } from '$lib/server/route-entries';
import { discoveryPolicy, markdownResponse } from '$lib/server/ai-discovery';
export const prerender = true;
export const trailingSlash = 'never';
export const entries = () => (discoveryPolicy().markdown ? getTranslatedPostEntries() : []);
export const GET = ({ params }: { params: { locale: string; slug: string } }) =>
	markdownResponse(params.locale, params.slug);
