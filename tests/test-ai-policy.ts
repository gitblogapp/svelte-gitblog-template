import assert from 'node:assert/strict';
import { test } from 'node:test';
import robotsParser from 'robots-parser';
import { aiPolicy, robotsText } from '../src/lib/template/ai-policy.ts';

test('search, training and Gemini permissions are independent and default to previous allow behavior', () => {
	assert.ok(aiPolicy({}).crawlers.every(({ allowed }) => allowed));
	const policy = aiPolicy({
		PUBLIC_AI_OPENAI_TRAINING_ENABLED: 'false',
		PUBLIC_AI_ANTHROPIC_TRAINING_ENABLED: 'OFF',
		PUBLIC_AI_GOOGLE_EXTENDED_ENABLED: 'no'
	});
	const robots = robotsParser(
		'https://example.com/robots.txt',
		robotsText(policy, 'https://example.com/notes')
	);
	for (const agent of [
		'OAI-SearchBot',
		'ChatGPT-User',
		'Claude-SearchBot',
		'Claude-User',
		'Googlebot',
		'bingbot'
	])
		assert.equal(robots.isAllowed('https://example.com/notes/blog/article/', agent), true, agent);
	for (const agent of ['GPTBot', 'ClaudeBot', 'Google-Extended'])
		assert.equal(robots.isAllowed('https://example.com/notes/blog/article/', agent), false, agent);
	assert.deepEqual(robots.getSitemaps(), ['https://example.com/notes/sitemap.xml']);
});

test('disabling search does not silently disable training, and exports are separately configurable', () => {
	const policy = aiPolicy({
		PUBLIC_AI_CHATGPT_SEARCH_ENABLED: 'false',
		PUBLIC_AI_CLAUDE_SEARCH_ENABLED: '0',
		PUBLIC_GOOGLE_SEARCH_ENABLED: 'false',
		PUBLIC_AI_MARKDOWN_ENABLED: 'off'
	});
	const robots = robotsParser(
		'https://example.com/robots.txt',
		robotsText(policy, 'https://example.com')
	);
	for (const agent of [
		'OAI-SearchBot',
		'ChatGPT-User',
		'Claude-SearchBot',
		'Claude-User',
		'Googlebot'
	])
		assert.equal(robots.isAllowed('https://example.com/blog/article/', agent), false);
	for (const agent of ['GPTBot', 'ClaudeBot', 'Google-Extended'])
		assert.equal(robots.isAllowed('https://example.com/blog/article/', agent), true);
	assert.equal(policy.markdown, false);
	assert.equal(policy.llms, true);
});
