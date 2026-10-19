import assert from 'node:assert/strict';
import { readFile, readdir, stat, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import { snapshotPaths, changedPaths } from '../scripts/lib/preservation.mjs';
import os from 'node:os';

const root = fileURLToPath(new URL('../', import.meta.url));
const policy = JSON.parse(await readFile(path.join(root, '.gitblog/update-policy.json')));
const userPaths = ['README.md', '.gitblog/user-instructions.md'];
const protectedBy = (file, entries) =>
	entries.some((entry) => file === entry || file.startsWith(`${entry}/`));
for (const file of userPaths)
	assert.ok(protectedBy(file, policy.preserve), `${file} must be preserved`);
assert.ok(protectedBy('AGENTS.md', policy.mergeOnly));
assert.ok(!protectedBy('AGENTS.md', policy.preserve), 'The entry point must remain updatable');

const officialDocs = [];
async function collect(directory) {
	for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
		const file = `${directory}/${entry.name}`;
		if (entry.isDirectory()) await collect(file);
		else if (entry.name.endsWith('.md')) officialDocs.push(file);
	}
}
await collect('docs/gitblog');
const legacyDocs = [
	'ai-discovery.md',
	'authoring.md',
	'customization.md',
	'github-auth.md',
	'llm-writing-guidelines.md',
	'setup.md',
	'readme/README.ko.md',
	'readme/README.ja.md',
	'readme/README.zh-CN.md'
].map((file) => `docs/${file}`);
let links = 0;
for (const file of [...officialDocs, ...legacyDocs]) {
	assert.ok(!protectedBy(file, policy.preserve), `${file} must receive official updates`);
	const text = await readFile(path.join(root, file), 'utf8');
	const localLinks = [];
	marked.walkTokens(marked.lexer(text), (token) => {
		if (
			!['link', 'image'].includes(token.type) ||
			/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(token.href)
		)
			return;
		const target = path.resolve(
			root,
			path.dirname(file),
			decodeURIComponent(token.href.split('#')[0])
		);
		assert.ok(target.startsWith(root), `${file}: link escapes repository`);
		localLinks.push(target);
	});
	for (const target of localLinks) {
		// User-owned files may deliberately be absent in upgraded blogs.
		if (userPaths.includes(path.relative(root, target))) continue;
		assert.ok((await stat(target)).isFile(), `${file}: broken link to ${target}`);
		links++;
	}
	if (legacyDocs.includes(file)) {
		assert.ok(
			localLinks.some((target) => target.startsWith(path.join(root, 'docs/gitblog/'))),
			`${file} must forward to maintained guidance`
		);
	}
}

// The policy consumed by update:check detects changes or deletion of user documents,
// while an absent optional user file remains a valid unchanged state.
const fixture = await mkdtemp(path.join(os.tmpdir(), 'gitblog-doc-preservation-'));
try {
	await mkdir(path.join(fixture, '.gitblog'));
	const absent = await snapshotPaths(fixture, policy.preserve);
	assert.deepEqual(changedPaths(absent, await snapshotPaths(fixture, policy.preserve)), []);
	for (const file of userPaths) await writeFile(path.join(fixture, file), '# Personal content\r\n');
	const before = await snapshotPaths(fixture, policy.preserve);
	await writeFile(path.join(fixture, 'README.md'), '# Replaced');
	await rm(path.join(fixture, '.gitblog/user-instructions.md'));
	assert.deepEqual(
		changedPaths(before, await snapshotPaths(fixture, policy.preserve)),
		[...userPaths].sort()
	);
} finally {
	await rm(fixture, { recursive: true, force: true });
}
console.log(
	`Harness documentation passed: ${links} local links, compatibility guides, and user-file preservation.`
);
