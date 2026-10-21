import {speechManifest} from '$lib/server/tts-manifest';
export const prerender=true;
export const trailingSlash='never';
export const GET=async()=>Response.json(await speechManifest());
