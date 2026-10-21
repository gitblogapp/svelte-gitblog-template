import adapter from '@sveltejs/adapter-static';

import { loadEnv } from 'vite';
import { pagesBase } from './scripts/lib/site-config.mjs';

// PUBLIC_SITE_URL is authoritative for root/custom-domain and project Pages paths.
const base = pagesBase(
	process.env,
	loadEnv('production', process.cwd(), 'PUBLIC_').PUBLIC_SITE_URL
);

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build'
		}),
		prerender: {
			entries: [
				'*',
				'/.well-known/blog-hub.json',
				'/.well-known/ai-discovery.json',
				'/.well-known/tts-input.json',
				'/.well-known/tts.json'
			],
			handleUnseenRoutes: ({ routes, message }) => {
				// Dynamic post routes have no entries in a new blog or when every post is a draft.
				const unexpectedRoutes = routes.filter(
					(route) =>
						route !== '/blog/[slug]' &&
						route !== '/blog/[slug]/index.md' &&
						!route.startsWith('/[locale=translatedLocale]')
				);

				if (unexpectedRoutes.length === 0) {
					console.warn(message);
					return;
				}

				throw new Error(message);
			}
		},
		paths: {
			base
		}
	}
};

export default config;
