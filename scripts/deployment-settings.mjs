import { readFile, appendFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { deploymentConfig } from './lib/deployment-config.mjs';

const config = deploymentConfig(parseEnv(await readFile('.env.production', 'utf8')), {
	allowPending: true
});
const output = `provider=${config.provider}\nready=${config.ready}\naccount_id=${config.accountId}\nproject_name=${config.projectName}\nsite_url=${config.siteUrl}\n`;
if (Object.values(config).some((value) => typeof value === 'string' && /[\r\n]/.test(value)))
	throw new Error('Deployment settings must be single-line values');
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, output);
if (!config.ready)
	console.log(
		'Cloudflare connection pending. Complete deployment settings in GitBlog, then deploy again.'
	);
