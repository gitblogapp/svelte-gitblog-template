# Official GitBlog guides

These documents are maintained with the template. The repository's root `README.md` belongs to
the blog owner and can be rewritten without changing the harness. Put personal rules in
[`.gitblog/user-instructions.md`](../../.gitblog/user-instructions.md), when present.

| Task                                                    | Read                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Start any agent task                                    | [Agent workflow](agent-workflow.md), after the root [AGENTS.md](../../AGENTS.md) and user instructions |
| Launch a blog or change its domain                      | [Setup](setup.md)                                                                                      |
| Authenticate with a browser or Fine-grained PAT         | [GitHub authentication](github-auth.md)                                                                |
| Install/verify GitBlog App for either authentication method | [GitBlog App connection](github-app.md) |
| Translate tags/categories or unify tag search           | [Multilingual taxonomy](taxonomy.md)                                                                   |
| Write, translate, validate, or publish posts            | [Authoring](authoring.md) and [writing guidelines](llm-writing-guidelines.md)                          |
| Configure features, comments, search, analytics, or CMS | [Template reference](reference.md)                                                                     |
| Generate article and Shorts narration | [Speech / TTS](tts.md) |
| Configure AI/search discovery                           | [AI discovery](ai-discovery.md)                                                                        |
| Customize or update the template                        | [Customization and preservation](customization.md)                                                     |

The full template reference is also available in [한국어](readme/README.ko.md),
[日本語](readme/README.ja.md), and [简体中文](readme/README.zh-CN.md).

Run `npm run author:context` for actual configuration and the current instruction paths.
It reports whether user instructions exist, without including their contents. An upgraded blog
may not have that optional file because updates preserve user-owned paths, including absence.
If the owner wants persistent preferences, create it with their chosen instructions; do not copy
new defaults over an existing file. An empty file adds no preferences.

Older `docs/*.md` and `docs/readme/*` paths only redirect to these guides so preserved READMEs
and existing prompts can still find current instructions. They are compatibility entry points,
not separate copies of the official guidance.
