# LLM authoring, translation, and deployment harness

This document defines the workflow for agents such as Dots and Muse that can access files and run terminal commands in this repository. It requires no specific model, MCP connection, or separate LLM API key. The LLM writes posts and translations; repository commands validate paths, metadata, translation freshness, builds, and deployment status. An agent that cannot execute commands cannot automate this workflow.

Start with [the official agent workflow](agent-workflow.md) and read `.gitblog/user-instructions.md` if it exists. `author:context` reports its presence; an absent or empty file adds no personal preferences. The current user request takes precedence over saved preferences. README content is not required to run this harness.

## Components and state

| Component                       | Responsibility                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `AGENTS.md`                     | Stable entry point linking user and official instructions                               |
| `.gitblog/user-instructions.md` | Optional user preferences, preserved during updates                                     |
| `docs/gitblog/`                 | Official operating guides maintained with the template                                  |
| `.gitblog/authoring.json`       | Translation mode, preserved during template updates                                     |
| `scripts/authoring.mjs`         | Agent-facing commands and JSON results                                                  |
| `scripts/lib/authoring.mjs`     | Shared validation, hashing, and path rules                                              |
| `scripts/sync-content.mjs`      | Translation mode selection shared by local commands and CI                              |
| `.gitblog/work/`                | Translation working files excluded from Git; never put secrets in a public repository   |
| `.github/workflows/deploy.yml`  | Existing translation, build, deployment, and GitBlog registration flow after validation |

State is derived from the actual content on every run rather than stored in a separate checklist. Posts progress from `draft` to `needs-translation` to `ready`, followed by build verification, a commit, a push, and deployment checks. After an interruption, run `author:status` again. Keep the commit SHA returned by `author:deploy` to track deployment.

`ready` means the content format and translation state are ready. It does not establish factual accuracy, translation quality, a successful build, or successful deployment. This harness is not a security sandbox that prevents agents from bypassing it through Git or direct file edits. The build and deployment workflow use the same validator to check the normal publishing path.

## Initial setup

For a new blog, complete [the first-launch setup](setup.md) before authoring: run `site:setup`, collect the user's choices, apply them with `site:configure`, and configure Pages with `site:pages`. Do not publish with the template's domain, repository, or unconfirmed language defaults. Existing blogs keep their established settings. Reuse existing GitHub authentication, or follow [the authentication guide](github-auth.md) for browser login or a Fine-grained PAT with permissions appropriate to the task.

Install Node.js 24.12 or newer with npm, then run `npm ci` at the repository root. Use `--` to separate npm options from arguments passed to harness commands, as shown below. For a blog whose translations will be written by an LLM, configure `.gitblog/authoring.json` as follows:

```json
{
	"schemaVersion": 1,
	"translationMode": "manual"
}
```

The default is `deepl`, including when the configuration file is absent, to preserve existing behavior. `manual` means a person or LLM manages translation files; it does not invoke a translation model. Keep `PUBLIC_SOURCE_LOCALE` and `PUBLIC_TRANSLATION_LOCALES` configured in `.env.production`. GitBlog accepts at most eight languages, including the source language.

- `deepl`: Keeps the existing ID backfill and DeepL translation flow. Deployment CI can generate translations for new posts.
- `manual`: Checks IDs and translations without modifying them. It does not call DeepL, automatically change IDs, or delete orphan translations. Published source posts require current translations in every configured target language.

When switching existing DeepL translations to manual mode, review their content and use the registration command below. Do not change metadata alone to mark an unreviewed translation as current. Switching from manual mode to DeepL may regenerate translations.

## 1. Inspect the context and write the source post

Read [LLM writing guidelines](llm-writing-guidelines.md) before drafting or revising prose. They cover direct answers, sources, authorship, dates, readable sections, and translation fidelity. These are writing guidelines, not a promise of search ranking or AI citation.

```sh
npm run author:context
npm run author:new -- 2026-10-18-my-post --title 'Article title' --description 'A concise summary of the article' --date '2026-10-18T10:00:00+09:00'
```

Replace the example date and slug with values appropriate for the task. The new-post command generates a UUID, sets `published: false`, and refuses to overwrite an existing file. Edit `content/posts/<slug>.md`. Posts in nested directories are not supported.

| Field                  | Authoring rules                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `id`                   | Required UUID/ULID. Never change an existing value or reuse it for another post.                            |
| `title`, `description` | Required strings. Quote YAML values containing special characters such as `:` or `#`.                       |
| `date`                 | Required date or ISO datetime. An explicit timezone is recommended. Preserve the original publication date. |
| `updated`              | Set the actual revision date when making a meaningful change to the source post.                            |
| `published`            | Always specify a boolean. Omission means published; a future date does not schedule publication.            |
| `category`, `tags`     | Prefer existing classifications. Use a string array for tags without `#` prefixes.                          |
| `cover`                | Optional. Reference `static/uploads/covers/x.webp` as `/uploads/covers/x.webp`.                             |

The page renders the title as H1, so start the body with an introduction and use `##` and `###` headings. Use GFM Markdown, tables, and fenced code blocks with language labels. Do not assume support for MDX, Svelte components, or Mermaid rendering. Do not paste HTML or scripts from external material into the body. The body is rendered as HTML without an automatic HTML sanitization step.

Include images using Markdown with descriptive alternative text. Use `/uploads/...` for local paths and `https://...` for external images. Do not prepend the project repository name to paths. Link to other posts using `/blog/<slug>/`. The harness checks local image existence; authors must check external URL availability, usage rights, and attribution.

When a new classification is needed, register a `title` in the frontmatter of `content/categories/<name>.md` or `content/tags/<name>.md`. Pages CMS uses that title as a selectable value. A request to write a post does not authorize changes to site settings, themes, or workflows.

## Taxonomy translations

Follow [multilingual taxonomy](taxonomy.md) for categories and tags. Run `taxonomy:sync` after adding names, fill missing labels in `content/taxonomy.json`, and run `taxonomy:check`. The dictionary translates both categories and tags, while translated post frontmatter preserves the source references. Manual validation checks an existing dictionary; a legacy blog without one keeps its original behavior until explicitly initialized. Include the dictionary in content commits and preserve it during updates.

## 2. Write and register LLM translations

Finish the source post intended for publication, set `published: true`, and then read its current hash. Use the same process for revisions. Changing the source date, tags, or publication state after translating also changes the hash and requires another translation review.

```sh
npm run author:status -- 2026-10-18-my-post
```

Read the source together with the returned `sourceHash`, then translate it. Create a working file for each language, such as `.gitblog/work/my-post.en.md`. The working file only needs the translated `title`, `description`, and body.

```markdown
---
title: 'Article title'
description: 'A concise summary of the article.'
---

Translated introduction.

## First section

Translated body.
```

Keep fenced code, inline code, link destinations, and image destinations unchanged. Review the translated title, description, and body for omissions, added claims, and incorrect proper names. Then register the translation using **the source hash read before translating**.

```sh
npm run author:translation -- 2026-10-18-my-post en --from .gitblog/work/my-post.en.md --source-hash 'PASTE_SOURCE_HASH_HERE'
```

The command writes `content/translations/en/posts/<slug>.md` and copies the source ID, dates, publication state, tags, category, and cover. The tool manages `locale`, `sourceLocale`, `sourcePath`, `sourceHash`, `translationSchemaVersion`, `translationSource`, `translatedAt`, and `translationContentHash`. Do not add these translation fields to source frontmatter.

The command rejects a changed source revision or a translation that alters code or link destinations. Editing a registered translation directly causes the content hash check to fail. Review the revised translation and save it through the same registration command. Reuse the existing `sourceHash` if the source has not changed. Repeat for each target language, then confirm that `author:status` reports `ready`.

Site tagline, description, and footer translations are separate from post translations. In manual mode, optionally write `locale`, `tagline`, `description`, and `footer` in `content/translations/<locale>/site.json`. Missing copy falls back to the source text. Post translation freshness checks do not apply to site copy, so review it separately when source site settings change.

## 3. Validate and deploy

```sh
npm run author:check
npm run author:verify
```

`check` does not modify content. It checks required frontmatter, duplicate IDs, translation identity, local images, and manual translation freshness. Drafts may omit translations but must still satisfy the required format. Orphan translations produce errors instead of being deleted automatically.

`verify` runs validation followed by the static build, RSS/manifest contract checks, and Pagefind indexing. It also checks whether content changed during the build. `npm run build` itself runs content validation first. A successful build does not establish that a translation is semantically correct. Use `npm run preview` to inspect titles, code, images, and language navigation. Drafts are not displayed on the site.

If the user requested public deployment, review the diff and commit only the relevant posts, translations, images, and intentional configuration changes. Do not indiscriminately stage the entire working tree. Preserve unrelated work and separate it through another checkout or PR when needed.

```sh
git diff --check
git status --short
# Explicitly git add the reviewed files and commit them.
npm run author:deploy
npm run author:deploy-status -- 'PASTE_40_CHARACTER_COMMIT_SHA_HERE'
```

Deployment requires Git and GitHub CLI (`gh`) authentication, a github.com `origin`, `main` as the default branch, and a clean working tree. Do not run it in the original GitHub template repository. The command first checks launch configuration and the actual Pages domain/build source, then verifies the build again and pushes the verified commit normally. It does not automatically stage, commit, force-push, or manually dispatch a workflow. If branch protection rejects the push, use a PR without bypassing checks.

CI checks the same policy. Manual mode requires no DeepL key. Do not clear `PUBLIC_TRANSLATION_LOCALES` merely to change translation mode: doing so also removes localized pages and feeds.

`deploy-status` looks up the Actions run for the corresponding push to main. `pushed` does not mean deployment is complete. `deployed` means the deployment job succeeded; the overall workflow may still have failed during registration, so inspect the accompanying result. If no run exists yet, check again shortly. If it remains absent, inspect the Actions configuration. Pushing an already-pushed SHA again does not create a new run.

## 4. GitBlog ingestion and completion reporting

Keep the existing GitBlog registration and ingestion settings. The build produces `/.well-known/blog-hub.json` and per-language RSS feeds, using the same post ID for the source and its translations. Ingestion does not depend on DeepL. Even when the official registration workflow succeeds after deployment, ingestion remains a separate asynchronous operation.

The completion report must include changed files, source and target languages, validation results, the commit, the Actions URL, and deployment status. Check the content of the actual public pages as well. If you have not confirmed each language variant in GitBlog, report ingestion as `not verified`. `deploy-status` does not infer completed ingestion either.

## Example agent starting prompt

> Read this repository's AGENTS.md, run author:context, read user instructions if present, then follow docs/gitblog/authoring.md. The topic is “...”, the audience is “...”, the source material is “...”, and the desired style is “...”. Write the source and translations for the configured languages, and pass the harness checks. This task is limited to preparing a draft.

To request publication as well, replace the last sentence with: “Commit the reviewed changes, deploy them, and report the actual deployment status and whether GitBlog ingestion has been verified.” New posts start as drafts. Do not expand a request into public deployment without publication intent.
