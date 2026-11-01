# Answer-first articles and evidence

These optional fields help readers find an answer, check its sources and understand when it was verified. They do not promise search rankings, AI citations or rich results. Existing articles need no migration.

## Write from evidence

1. Identify a real reader question and the evidence you can verify. Prefer original research, official documentation or your own reproducible observations.
2. Write a concise answer that the body supports. Keep description as a separate list/social summary. Never invent statistics, quotations, credentials or citations.
3. Add the sources actually consulted. Use `dataAsOf` only when a fact, policy or dataset has a meaningful reference date; it is independent of publication and modification dates.
4. Use descriptive headings, useful internal links and image alt text in the body. Add FAQ only for real follow-up questions. Short personal posts do not need these fields.
5. Check facts and links, then run the existing authoring and discovery checks. Missing sources produce advice, not fabricated content or a mandatory length target.

## Frontmatter contract

```yaml
seo:
  question: "What does this article establish?"
  answer: "A direct answer supported by the article and the sources below."
  dataAsOf: "2026-11-02"
  sources:
    - title: "Original source"
      url: "https://example.com/original-report"
  faq:
    - question: "What are the limitations?"
      answer: "Describe the actual limits of the evidence."
```

Every field is optional. A question requires an answer; an answer can stand alone. Text fields are plain text, not HTML or Markdown. Questions/source titles are limited to 500 characters and answers to 5,000; sources/FAQ to 20 entries each and the whole metadata object to 40,000 characters. Source URLs must be absolute HTTP(S), without credentials. `dataAsOf` must be a real YYYY-MM-DD date. Empty metadata is omitted.

The key answer appears before the body; reference date, sources and FAQ after it, in initial static HTML. The public Markdown representation includes the same content. `BlogPosting.abstract` and `citation` reflect the visible answer and sources. We deliberately do not generate FAQPage markup as a rich-result promise. Korean labels are used for Korean articles, English labels as the fallback for other locales.

Set optional `PUBLIC_AUTHOR_URL=https://your-domain.example/about/` in `.env.production` to link the article's author to a real profile. The site owner name remains the author name. All language variants share the site's `/#author` identity, including any GitHub Pages project subpath. Do not set a profile for someone who did not author the content.

## Studio, translation and membership

GitBlog Studio exposes the fields in **핵심 답변·출처·FAQ (선택)**. Saving without the new editor marker preserves legacy metadata; explicitly clearing the fields removes it. Templates with this feature are needed to display them.

DeepL translates the question, answer, source titles and FAQ prose. Dates and source URLs stay unchanged. Manual translations must keep the same field structure, reference date, source URLs and FAQ count, and be reviewed/sealed through the existing translation workflow. Content changes invalidate the existing source hash. The DeepL metadata contract is `markdown-xml-v4`; earlier automatic translations are regenerated to include the new fields.

For membership articles these fields are private: Studio stores them in the membership database and returns them only after the normal reader authorization. They must never be put in public repository frontmatter. Public stubs, translations, metadata and Markdown exports do not contain private answers or sources, even when the public preview is enabled. Private SEO prose is not sent through the repository's DeepL pipeline.

## Verification and measurement

- `npm run author:check`: validates types, bounds, date/URL safety and manual-translation invariants; source advice is reported as warnings.
- `npm run build` / `npm run discovery:check`: checks the generated HTML without running JavaScript, including title/description, canonical/Open Graph URL, BlogPosting identity/dates and social image consistency.
- `npm run test:seo-content` (development repository): exercises legacy/enhanced/translated/draft/member articles and checks rendered HTML plus public Markdown for leaks.
- After an actual deployment, use `author:deploy-status` and the live discovery audit described in [AI discovery](ai-discovery.md). Record the deployment revision and URLs. Search impressions, visits and AI referrals require real traffic and a baseline; passing local tests is not proof of visibility gains.

Crawler permissions remain in the existing AI discovery settings. `llms.txt` is an optional index, not an authorization or ranking standard. Naver verification, IndexNow and search-performance integrations are separate follow-up work.

## Provenance

Adapted for GitBlog from [fire-your-seo-agency](https://github.com/leopard627/fire-your-seo-agency), version 1.2.1, commit `5f7249f7eff119703f2a509d0dc5e21b7b3ccc4c` (reviewed 2026-11-02). The upstream project supplies editorial and audit guidance; it is not a runtime dependency or an automated SEO validator. GitBlog's actual content, privacy and deployment contracts take precedence. The upstream [MIT notice](fire-your-seo-agency-LICENSE.txt) is retained. Personal instructions and the owner's README stay untouched.
