// Keep these public keys/defaults aligned with GitBlog Studio's blog-settings.ts.
export const aiControls = [
	{ key: 'PUBLIC_AI_CHATGPT_SEARCH_ENABLED', agents: ['OAI-SearchBot', 'ChatGPT-User'] },
	{ key: 'PUBLIC_AI_CLAUDE_SEARCH_ENABLED', agents: ['Claude-SearchBot', 'Claude-User'] },
	{ key: 'PUBLIC_AI_GOOGLE_EXTENDED_ENABLED', agents: ['Google-Extended'] },
	{ key: 'PUBLIC_AI_OPENAI_TRAINING_ENABLED', agents: ['GPTBot'] },
	{ key: 'PUBLIC_AI_ANTHROPIC_TRAINING_ENABLED', agents: ['ClaudeBot'] },
	{ key: 'PUBLIC_GOOGLE_SEARCH_ENABLED', agents: ['Googlebot'] }
] as const;

export const publicFlag = (value: string | undefined) =>
	!['false', '0', 'no', 'off'].includes((value ?? '').trim().toLowerCase());

export function aiPolicy(env: Record<string, string | undefined>) {
	return {
		crawlers: aiControls.flatMap(({ key, agents }) =>
			agents.map((agent) => ({ agent, allowed: publicFlag(env[key]) }))
		),
		markdown: publicFlag(env.PUBLIC_AI_MARKDOWN_ENABLED),
		llms: publicFlag(env.PUBLIC_AI_LLMS_ENABLED)
	};
}

export function robotsText(policy: ReturnType<typeof aiPolicy>, siteUrl: string) {
	const site = siteUrl.replace(/\/+$/, '');
	return [
		'User-agent: *\nDisallow:',
		...policy.crawlers.map(
			({ agent, allowed }) => `User-agent: ${agent}\n${allowed ? 'Allow' : 'Disallow'}: /`
		),
		`Sitemap: ${site}/sitemap.xml`,
		''
	].join('\n\n');
}
