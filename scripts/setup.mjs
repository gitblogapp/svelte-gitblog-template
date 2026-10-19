import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { safePath } from './lib/authoring.mjs';
import { inspectSetup, applySetup, checkSetup, configurePages } from './lib/setup.mjs';
import { inspectAppAccess } from './lib/app-access.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
	const { positionals, values } = parseArgs({
		allowPositionals: true,
		options: { from: { type: 'string' } }
	});
	const [command = 'inspect'] = positionals;
	if (positionals.length > 1) throw new Error('Unexpected setup arguments');
	const answers = values.from
		? JSON.parse(await readFile(await safePath(root, values.from), 'utf8'))
		: {};
	let report;
	if (command === 'inspect') report = await inspectSetup(root, answers);
	else if (command === 'apply') {
		if (!values.from)
			throw new Error("Use --from .gitblog/work/setup.json with the user's answers");
		report = await applySetup(root, answers);
		if (!report.applied) process.exitCode = 1;
	} else if (command === 'check') {
		report = await checkSetup(root);
		if (!report.ok) process.exitCode = 1;
	} else if (command === 'app-status') {
		report = await inspectAppAccess(root);
		if (!report.ok) process.exitCode = 1;
	} else if (command === 'pages' || command === 'pages-status') {
		report = await configurePages(root, { write: command === 'pages' });
		if (!report.configurationReady) process.exitCode = 1;
	} else throw new Error('Use inspect, apply, check, app-status, pages, or pages-status');
	console.log(JSON.stringify(report, null, 2));
} catch (error) {
	console.log(
		JSON.stringify(
			{
				ok: false,
				error: error.message,
				next: 'Read docs/gitblog/setup.md; check gh auth status if GitHub access failed.'
			},
			null,
			2
		)
	);
	process.exitCode = 1;
}
