import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readPolicy } from './lib/authoring.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const policy = await readPolicy(root);
const run = (script, args = []) => {
	const result = spawnSync(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit' });
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
};

if (policy.translationMode === 'manual') {
	// Manual content belongs to its author: never backfill, delete or call DeepL.
	run('scripts/post-ids.mjs', ['--check']);
	if (
		!process.argv.includes('--prepare') &&
		existsSync(new URL('../content/taxonomy.json', import.meta.url))
	)
		run('scripts/taxonomy.mjs', ['--check']);
	run('scripts/authoring.mjs', ['check']);
} else {
	run('scripts/post-ids.mjs', ['--write']);
	if (!process.argv.includes('--prepare')) run('scripts/translate-posts.mjs');
}
