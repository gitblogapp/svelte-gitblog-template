import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './lib/env.mjs';
import { locales } from './lib/authoring.mjs';
import { collectTaxonomy, saveTaxonomy, missingTaxonomy, taxonomyFile } from './lib/taxonomy.ts';
const root = fileURLToPath(new URL('../', import.meta.url));
loadEnvFile(new URL('../.env.production', import.meta.url));
const languages = locales(process.env);
const data = await collectTaxonomy(root, languages.source);
const missing = missingTaxonomy(data, languages.targets);
if (!process.argv.includes('--check')) await saveTaxonomy(root, data);
console.log(
	JSON.stringify(
		{
			path: taxonomyFile,
			missing,
			note: 'Fill missing labels; preserve IDs, existing labels and sources. Set separate:true on tags that must not merge.'
		},
		null,
		2
	)
);
if (process.argv.includes('--check') && missing.length) process.exitCode = 1;
