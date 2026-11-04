import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readTranslationPlan } from './lib/authoring.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { policy, hasManualPosts, hasDeeplPosts } = await readTranslationPlan(root);
const run = (script, args = []) => {
	const result = spawnSync(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit' });
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
};

if (policy.translationMode === 'manual' || hasManualPosts) {
	// Mixed/manual content is validated before any automatic writes or API calls.
	run('scripts/post-ids.mjs', ['--check']);
	if (
		policy.translationMode === 'manual' &&
		!process.argv.includes('--prepare') &&
		existsSync(new URL('../content/taxonomy.json', import.meta.url))
	)
		run('scripts/taxonomy.mjs', ['--check']);
	run('scripts/authoring.mjs', ['check']);
} else {
	run('scripts/post-ids.mjs', ['--write']);
}

if (!process.argv.includes('--prepare') && (policy.translationMode === 'deepl' || hasDeeplPosts)) {
	run('scripts/translate-posts.mjs');
}
