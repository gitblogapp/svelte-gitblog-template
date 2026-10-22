import { writeFile, rm } from 'node:fs/promises';
import { loadEnv } from 'vite';
import { siteAddress } from './lib/site-config.mjs';

const env = loadEnv('production', process.cwd(), '');
const { cname } = siteAddress(process.env.PUBLIC_SITE_URL || env.PUBLIC_SITE_URL);
// Only the build output changes; source files remain untouched during verification.
if (cname && (process.env.GITBLOG_DEPLOY_PROVIDER || env.GITBLOG_DEPLOY_PROVIDER) !== 'cloudflare')
	await writeFile('build/CNAME', `${cname}\n`);
else await rm('build/CNAME', { force: true });
