# AI access and crawl checks

GitBlog Studio → Blog settings → **AI 검색과 콘텐츠 접근** saves the following public preferences in `.env.production`. Deploy the updated template before expecting these controls to work. Missing settings default to `true`, preserving earlier releases' unrestricted crawl policy. `false`, `0`, `no`, and `off` disable a preference.

| Setting                                | Controls                                                               |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `PUBLIC_AI_CHATGPT_SEARCH_ENABLED`     | OAI-SearchBot and ChatGPT-User                                         |
| `PUBLIC_AI_CLAUDE_SEARCH_ENABLED`      | Claude-SearchBot and Claude-User                                       |
| `PUBLIC_AI_GOOGLE_EXTENDED_ENABLED`    | Google-Extended: Gemini training and supported grounding uses together |
| `PUBLIC_AI_OPENAI_TRAINING_ENABLED`    | GPTBot                                                                 |
| `PUBLIC_AI_ANTHROPIC_TRAINING_ENABLED` | ClaudeBot                                                              |
| `PUBLIC_GOOGLE_SEARCH_ENABLED`         | Googlebot, including Google's Search AI features                       |
| `PUBLIC_AI_MARKDOWN_ENABLED`           | Public article `index.md` exports and HTML alternate links             |
| `PUBLIC_AI_LLMS_ENABLED`               | The public article index in `/llms.txt`                                |

These are crawler preferences, not authentication, immediate removal of previously collected content, or an AI citation guarantee. ChatGPT-User requests are user initiated and robots.txt may not apply. Google-Extended is a policy token, not a separate HTTP user agent; it does not control Google Search inclusion. Googlebot stays independent. Training permission does not purchase or guarantee visibility.

On `https://owner.github.io/blog/`, `/blog/robots.txt` is **not** authoritative. The host's `https://owner.github.io/robots.txt` controls crawling. Set that file in the owner's root Pages site (scoping rules to the appropriate paths when it serves multiple blogs), or use a custom domain. A generated project robots file cannot claim to have applied its policy to the whole host. The audit reports this limitation. Submit the project's sitemap URL in Search Console and Bing Webmaster Tools when root robots cannot advertise it.

## Public representations

`/blog/<slug>/index.md` and `/<locale>/blog/<slug>/index.md` contain the published body and a small metadata allowlist: title, description, author, publication/revision dates, language, site URL and original HTML URL. They never expose arbitrary source frontmatter. Relative Markdown URLs resolve against the matching article directory; root-relative media paths need the deployment base from `site_url` when consumed outside the website. HTML remains the canonical article. Server endpoint headers may not survive static hosting, so the original URL is also written in the Markdown metadata.

The Markdown link beneath the article and `rel="alternate" type="text/markdown"` expose this representation. Disabling Markdown removes its generated files and links on the next deployment. `/llms.txt` contains links and summaries in every configured language; it is a voluntary discovery aid. When disabled, it contains only a disabled notice and no article index. The public `/.well-known/ai-discovery.json` holds the policy and published URL set for diagnostics; it is not a new crawler protocol or an access control. All outputs share HTML's publication filter, including unpublished source posts and their translations.

## Validation

`npm run build` runs a local crawl check after generating the site. `npm run discovery:check` can repeat it. The check verifies every published article's static body, status, canonical, alternate targets, sitemap membership, Markdown availability, and requested crawler policy without executing browser JavaScript. Generated reports are ignored by Git.

`npm run discovery:check -- --live` checks the deployed HTTPS site against the current build manifest, including the host-root robots, HTTP headers, bot user-agent probes and deployed policy. It samples up to 10 articles, rotating languages; `--limit=100` increases that sample (maximum 1000). The report states coverage. Probes come from the checker host, not the providers' IP ranges: they cannot establish real crawler access through IP-dependent WAF rules. Inspect CDN/firewall logs and provider-published IP guidance separately.

The Pages workflow runs live checks after deployment, publishes an Actions summary and uploads a `discovery-audit` JSON artifact. Failures mark that check job as failed; deployment and GitBlog registration remain separate states. A root-policy warning needs action at the host root; the workflow does not rewrite another repository or domain. Network errors, redirects, stale manifests, missing article bodies and accidental generic noindex/nosnippet restrictions are reported as failures. Re-run after investigating transient failures or cache propagation.

Keep distinct measurements for crawler visits, search indexing, AI citations, and referred visits. This check establishes technical observations only. Use Search Console, webmaster tools, access logs and a documented set of representative queries for the remaining stages.

Official references: [OpenAI crawlers](https://developers.openai.com/api/docs/bots), [Anthropic crawlers](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler), [Google crawler controls](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers), [Google AI search](https://developers.google.com/search/docs/appearance/ai-features).
