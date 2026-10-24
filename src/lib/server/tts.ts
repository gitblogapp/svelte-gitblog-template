import { env } from '$env/dynamic/public';
import {voice,ttsHash,findAudio,rawAudio as audioUrl} from '@gitblogapp/core/speech';
export {ttsHash};
const files = import.meta.glob('/content/audio/manifest.json', { eager: true, import: 'default' });
type AudioEntry = {
	postId: string;
	locale: string;
	textHash: string;
	fullHash: string;
	voice: string;
	previewPath: string;
	fullPath: string;
	version: string;
};
const manifest = Object.values(files)[0] as { posts?: AudioEntry[] } | undefined;
export const ttsVoice=(value:unknown)=>voice(value,env.PUBLIC_TTS_VOICE);
export const ttsEnabled = (value: unknown) =>
	typeof value === 'boolean' ? value : env.PUBLIC_TTS_ENABLED === 'true';
export function audioEntry(id:string,locale:string,voice:string,fullText:string){return findAudio(manifest?.posts??[],id,locale,voice,fullText);}
export function rawAudio(path:string){return audioUrl(process.env.GITHUB_REPOSITORY||env.PUBLIC_SITE_REPOSITORY||'',path);}
