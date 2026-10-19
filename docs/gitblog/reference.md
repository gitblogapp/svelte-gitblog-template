# SvelteKit GitBlog template reference

This is the maintained template manual. The root README is the blog owner's introduction and is not required by the harness. See the [guide index](README.md) and [user instruction policy](customization.md#documentation-and-user-instructions).

**English** | [한국어](readme/README.ko.md) | [日本語](readme/README.ja.md) | [简体中文](readme/README.zh-CN.md)

A static blog template built with SvelteKit. The entire site is prerendered with `@sveltejs/adapter-static`, deployed to GitHub Pages through GitHub Actions, and edited as Markdown through Pages CMS.

## Stack

- SvelteKit and `@sveltejs/adapter-static`
- GitHub Pages deployment through `.github/workflows/deploy.yml`
- Pages CMS configured by the root `.pages.yml`
- Markdown posts in `content/posts`
- DeepL translation sync in `content/translations/<locale>`

## Local development

Install [Node.js](https://nodejs.org/) 24.12 or newer, which includes npm. Bun is not required.

```sh
npm install
npm run dev
```

Pagefind builds its search index after the static site build. To test search locally:

```sh
npm run build
npm run preview
```

To refresh all configured translations locally, provide a DeepL API key:

```sh
DEEPL_API_KEY=your-key npm run translate:content
```

## First launch with an LLM

GitHub authentication supports existing credentials, browser login, or a **Fine-grained PAT**. The [authentication guide](github-auth.md) walks users and agents through token issuance, repository permissions, and local `GH_TOKEN` setup.

Start with the [setup guide](setup.md) before writing the first post. Run `npm run site:setup` to discover repository settings and the questions the agent must ask the user. The harness infers the repository and comment IDs, while the user chooses the blog title, public URL, languages, and whether to enable comments.

```sh
npm run site:setup
# Save the user's answers in .gitblog/work/setup.json as described in the guide.
npm run site:configure -- --from .gitblog/work/setup.json
npm run site:check
npm run site:pages
```

Configuration updates `.env.production` and generates `static/CNAME` from a custom `PUBLIC_SITE_URL`. `site:pages` also updates GitHub Pages settings: Actions deployments do not configure domains from CNAME files alone. Domain DNS must be configured separately. Run `npm run site:pages:status` to inspect the actual Pages settings before deployment.

## LLM authoring harness

Start with [AGENTS.md](../../AGENTS.md) and the [authoring workflow](authoring.md).
Run `npm run author:context` for repository settings and `npm run author:status` to resume work.
The harness creates drafts, accepts revision-bound translations, validates content, builds the site,
and provides explicit deployment and status commands. It does not run an LLM itself.

Set `translationMode` to `manual` in [`.gitblog/authoring.json`](../../.gitblog/authoring.json) for
human/LLM-authored translations without DeepL. The default remains `deepl`.
Manual mode validates published translations in CI and never regenerates or deletes them.
Keep `PUBLIC_TRANSLATION_LOCALES` configured for localized pages and GitBlog feeds.

## Content structure

- `.env.production`: public deployment configuration
- `content/posts/*.md`: source posts with frontmatter and Markdown
- `content/translations/<locale>/site.json`: generated localized site copy
- `content/translations/<locale>/posts/*.md`: generated localized posts
- `static/assets/icons/`: bundled favicon and app icons
- `static/uploads`: files uploaded through Pages CMS
- `scripts/`: build, deployment, and validation tools
- `tests/`: regression and template integration tests

`content`, `.env.production`, and `static/uploads` are owned by each blog. Application code remains in `src`, reducing conflicts when upstream template updates are merged.

## Post Markdown template

Create posts as `.md` files under `content/posts`. The filename without `.md` becomes the URL slug, so `YYYY-MM-DD-kebab-case.md` is recommended.

````markdown
---
id: 2f4ad174-baba-4aa4-89ad-72760aeb2509
title: Deploying a SvelteKit blog
description: A practical guide to deploying a static SvelteKit blog to GitHub Pages.
date: 2026-07-12T18:00:00
updated: 2026-07-13T09:30:00
published: true
category: Technical
tags:
  - sveltekit
  - github-pages
cover: /uploads/covers/sveltekit-blog.webp
---

Write the introduction here.

## First section

The body supports regular Markdown.

```ts
const message = 'Code blocks are preserved during translation.';
```
````

Frontmatter fields follow these rules:

| Field         | Required | Format and behavior                                                                            |
| ------------- | -------- | ---------------------------------------------------------------------------------------------- |
| `id`          | Required | Immutable UUID or ULID. Generate missing IDs with `npm run posts:ids`; never reuse one.        |
| `title`       | Required | Used on list/detail pages and in SEO metadata.                                                 |
| `description` | Required | Used as the post excerpt and SEO description.                                                  |
| `date`        | Required | Use `YYYY-MM-DD` or an ISO datetime. Controls publication date and sorting.                    |
| `updated`     | Optional | ISO date or datetime for meaningful post revisions. Included in the gitblog feed when present. |
| `published`   | Optional | Defaults to `true`. Set to `false` to exclude the post from the build.                         |
| `category`    | Optional | Defaults to `Notes`. Register it in `content/categories` before selecting it in Pages CMS.     |
| `tags`        | Optional | A string array is recommended. Register values in `content/tags` for Pages CMS.                |
| `cover`       | Optional | Public path relative to `static`; CMS uploads use `/uploads/...`.                              |

Tags are stored without `#` and displayed in the same form. An array is recommended:

```yaml
category: Technical
tags:
  - dev
  - git
```

A comma-separated string is also accepted:

```yaml
tags: 'dev, git'
```

`id` belongs to the source post and must survive filename/slug changes. Translations always copy the source ID; do not assign translation IDs independently. Safely backfill IDs and validate all variants with:

```sh
npm run posts:ids
npm run posts:ids:check
```

The backfill command is idempotent. It adds missing source IDs, copies them to translations, removes orphan generated translations, and refuses to overwrite invalid, duplicate, or mismatched existing IDs. Translation sync and GitHub Actions run it before translating; the workflow persists newly generated IDs.

Do not add translation metadata (`locale`, `sourceLocale`, `sourcePath`, `sourceHash`, `translationSchemaVersion`, `translationSource`, `translatedAt`, or `translationContentHash`) to source posts. In `deepl` mode, update `content/translations` with `npm run translate:content`. In `manual` mode, use `npm run author:translation` as described in the [authoring guide](authoring.md); `translate:content` only validates the files.

## Search

- `/search`: search in the source locale
- `/<locale>/search`: search in each configured translation locale
- Pagefind indexes post titles, descriptions, and bodies.
- Category, tag, and locale values are exposed as Pagefind filters.

## gitblog participation

The static build publishes a discovery manifest at `/.well-known/blog-hub.json` (under the GitHub Pages project base path when one is configured). Participation is enabled by default. Set the following public deployment values in `.env.production`:

```sh
PUBLIC_HUB_ENABLED=true
PUBLIC_HUB_URL=https://hub.example.com
PUBLIC_SITE_REPOSITORY=owner/repository
```

- Set `PUBLIC_HUB_ENABLED=false` (also accepts `0`, `no`, or `off`) to opt out. The manifest remains discoverable with `enabled: false`, and workflows stop sending hints.
- `PUBLIC_SITE_REPOSITORY` identifies this blog repository and is the local-build fallback. GitHub Actions uses the trustworthy `GITHUB_REPOSITORY` context instead, so forks do not inherit the upstream repository identity.
- `PUBLIC_HUB_URL` is the gitblog origin used for optional deployment and discussion-comment hints. Leave it empty to rely only on periodic gitblog discovery and feed polling.
- Hint requests contain GitHub identifiers only. gitblog must fetch and verify the public manifest, feed, Discussion, and comment itself.
- Hint delivery has a 10-second timeout and never fails a successful Pages deployment or comment workflow.

The schema-version 1 manifest includes `repository`, `siteUrl`, `sourceLocale`, and an absolute RSS URL for every configured locale. RSS remains valid RSS 2.0 and adds the `https://gitblog.dev/ns/hub/1.0` namespace:

- `<guid isPermaLink="false">` and `<hub:postId>` contain the immutable source post ID.
- `<hub:locale>` identifies the variant while `<hub:sourceLocale>` identifies the source language. Variants share the same post ID.
- `<hub:giscusTerm>` is derived from the immutable ID, so renaming a Markdown file does not split its discussion identity.
- `<hub:cover>` is an absolute URL when a cover exists, and `<hub:updated>` is emitted when `updated` is present.

After a successful Pages deployment, `deploy.yml` sends `POST /v1/ingestion/deploy-hint`. `.github/workflows/hub-discussion-comment.yml` sends created/deleted `discussion_comment` events to `POST /v1/events/comment-hint`. Existing slug-based Giscus discussions are updated in place to the ID-based term during discussion sync, preserving their comments rather than creating replacement discussions.

## GitHub Pages setup

1. Push the repository to GitHub.
2. Open `Settings > Pages` and set `Source` to `GitHub Actions`.
3. Confirm that the default branch is `main`.
4. Set `PUBLIC_SITE_URL` in `.env.production` to the production URL.
5. Add `DEEPL_API_KEY` under `Secrets and variables > Actions`.
6. For DeepL Free, optionally add `DEEPL_API_URL=https://api-free.deepl.com`.
7. Configure site metadata and source/translation/release locales in [`.env.production`](../../.env.production).

The build derives its base path from `PUBLIC_SITE_URL`: `/repo` for a project Pages URL and an empty path for a root site or custom domain. `SITE_BASE_PATH` can explicitly override this for previews. The build also writes `build/CNAME` for a custom hostname; configure the Pages domain through `site:pages` as described in the [setup guide](setup.md).

### SEO for translated posts

Every published language version has its own self-referencing canonical URL. The HTML head and `sitemap.xml` share the same reciprocal `hreflang` links, including the page itself and an `x-default` link to the source article. Only published, configured translations are listed. Unpublishing a source article also removes any leftover translations from the generated pages, feeds, and sitemap.

Language codes follow the configured audience: `en` remains generic English, `en-gb` becomes `en-GB`, and `zh-hans` / `zh-hant` retain their script distinctions. Article URLs encode the filename slug and retain the deployment's project path. Sitemap `lastmod`, structured data `dateModified`, and Open Graph modification time use `updated` when present; a newer translation `translatedAt` takes precedence for that translation. Builds do not invent modification times.

Run `npm run test:seo` to verify the generated HTML and XML for project Pages and root/custom-domain deployments. This regression check also runs inside `npm run update:check`. Existing blogs receive these changes after applying the template update in Studio and successfully redeploying.

### Google Search registration

A GitHub project Pages site is deployed under `https://<owner>.github.io/<repository>/`. Search crawlers only treat `https://<owner>.github.io/robots.txt` as the standard host-level robots file, so submit the sitemap directly through Google Search Console.

1. Add the full deployment URL, including the trailing slash, as a URL-prefix property:

   ```text
   https://<owner>.github.io/<repository>/
   ```

2. Copy only the `content` value from the HTML verification tag into `.env.production`:

   ```sh
   PUBLIC_GOOGLE_SITE_VERIFICATION=your-verification-token
   ```

   The build adds this tag to every page:

   ```html
   <meta name="google-site-verification" content="your-verification-token" />
   ```

3. Deploy, verify ownership, and submit:

   ```text
   https://<owner>.github.io/<repository>/sitemap.xml
   ```

On a custom domain or an `<owner>.github.io` root site, the generated `/robots.txt` is at the host root and its sitemap declaration is valid. Keep the verification tag deployed to preserve Search Console ownership.

### Bing Webmaster Tools registration

1. Add your full blog URL (including the project path, if any) to [Bing Webmaster Tools](https://www.bing.com/webmasters/) and choose HTML meta tag verification.
2. Copy only the tag's `content` value into **Studio → Blog settings → Social links and search → Bing site verification value**, or set it in `.env.production`:

   ```sh
   PUBLIC_BING_SITE_VERIFICATION=your-bing-verification-token
   ```

   After deploying the updated template, every page includes:

   ```html
   <meta name="msvalidate.01" content="your-bing-verification-token" />
   ```

3. Verify ownership in Bing Webmaster Tools after deployment, then submit your blog's `sitemap.xml` (for example, `https://<owner>.github.io/<repository>/sitemap.xml`).

Google and Bing verification values are independent. Keep the value to retain the verification tag; leaving it empty omits the tag. Existing blogs need the template update and a successful deployment before this setting takes effect.

To test a base path locally:

```sh
SITE_BASE_PATH=blog npm run build
```

## Updating from the upstream template

Use a real GitHub **Fork** when you want to keep receiving template updates. A fork retains its relationship with the original repository and supports GitHub's `Sync fork` feature. A repository created with `Use this template` has independent Git history and is not automatically synchronized.

Commit your blog changes and confirm that the working tree is clean before updating. Preserve the blog-owned `content`, `.env.production`, and `static/uploads` paths when resolving conflicts.

### Updating a fork

Register the original repository once:

```sh
git remote add upstream https://github.com/ORIGINAL_OWNER/ORIGINAL_REPOSITORY.git
git remote -v
```

Fetch and merge later updates:

```sh
git fetch upstream
git switch main
git merge upstream/main
npm ci
npm run check
npm run build
git push origin main
```

GitHub's `Sync fork` → `Update branch` works when there are no conflicts. A local merge is easier to inspect when conflicts are expected.

Resolve each conflicted file, then stage only the resolved paths:

```sh
git status
git add path/to/resolved-file
git commit
```

Run `git merge --abort` before committing if you need to cancel the merge.

### Repositories created with `Use this template`

These repositories cannot use `Sync fork` because they have no shared Git history with the original. For reliable long-term updates, create a real fork and move `content`, `.env.production`, `static/uploads`, and any intentional custom code into it.

If the independent repository must remain, register the original remote and cherry-pick only the required commits:

```sh
git remote add upstream https://github.com/ORIGINAL_OWNER/ORIGINAL_REPOSITORY.git
git fetch upstream
git log --oneline upstream/main
git cherry-pick <commit-sha>
```

Merging all updates with `--allow-unrelated-histories` is not recommended because even matching files can conflict during the first merge.

## Pages CMS setup

1. Sign in to [Pages CMS](https://pagescms.org) with GitHub.
2. Select this repository.
3. Pages CMS reads `.pages.yml` and creates `Posts`, `Categories`, and `Tags` editors.
4. Saving content commits it to the repository; pushes to `main` trigger deployment.

The open `workflow_dispatch` event also exposes a `Deploy GitHub Pages` action in Pages CMS.

Current CMS rules:

- New post filename: `YYYY-MM-DD-title.md`
- Uploaded filenames: normalized to safe slugs
- Categories: created in `Categories` before post selection
- Publication date: datetime with second precision
- Post list: descending by `date`

## Site configuration

Shared public site settings live in `.env.production`. Both `npm run dev` and `npm run build` load its `PUBLIC_` values, so the site title, languages, and social links use the same defaults. Development still runs in Vite's development mode; private production variables are not imported into development by this shared loader. `PUBLIC_SITE_URL` is required. The title defaults to `Blog`; optional copy and comment settings stay empty when unset. Edit `.env.production` for site settings; Pages CMS edits content only. Generated translations remain in `content/translations/<locale>/site.json`.

Explicit process environment values take priority, followed by the current mode's normal env settings, then production public settings. For example, `.env.development.local` can override public settings for local development. Restart the dev server after changing env files. `npm run preview` serves the last `build/` output; run `npm run build` again to preview configuration or code changes.

```sh
PUBLIC_SITE_TITLE="My Blog"
PUBLIC_SITE_TAGLINE="Notes and essays"
PUBLIC_SITE_DESCRIPTION="A static blog built with SvelteKit."
PUBLIC_SITE_OWNER="Your Name"
PUBLIC_SITE_FOOTER="Built with SvelteKit."
PUBLIC_SITE_URL=https://example.com
PUBLIC_GOOGLE_SITE_VERIFICATION=your-verification-token
PUBLIC_BING_SITE_VERIFICATION=your-bing-verification-token
PUBLIC_SOCIAL_X_URL=https://x.com/your-handle
PUBLIC_SOCIAL_GITHUB_URL=https://github.com/your-name
```

Store only source copy in `PUBLIC_SITE_TAGLINE`, `PUBLIC_SITE_DESCRIPTION`, and `PUBLIC_SITE_FOOTER`. Deployment generates localized values in `content/translations/<locale>/site.json`. Locale-suffixed variables such as `PUBLIC_SITE_DESCRIPTION_EN` are not used.

`PUBLIC_SITE_AUTHOR` is accepted as an alias of `PUBLIC_SITE_OWNER` and takes precedence when both are present.

## Removing a post from Git history

GitBlog Studio can analyze and remove a post’s Markdown history after the repository administrator reviews and confirms the exact plan. `.github/workflows/post-history.yml` runs in this **blog repository** and calls the public template’s reusable worker at an immutable commit. The GitBlog App only needs access to this blog; do not add a PAT or App private key to its secrets. The service repository does not need an App installation.

New blogs inherit this workflow. For an existing blog, add the latest template’s `.github/workflows/post-history.yml` to its default branch, or merge the changes if it already exists. Enable GitHub Actions and allow the `gitblogapp/svelte-gitblog-template` reusable workflow in the repository/organization Actions policy. The caller’s pinned SHA must match the version approved by the GitBlog server; Studio reports a missing or outdated workflow before starting an operation. Run history, logs, and Actions usage belong to the blog repository.

After a history rewrite, deployment continues from the current commit. Forced pushes and unavailable or non-ancestor `before` commits skip only post Release synchronization; surviving posts are not republished as new releases, and removed history is not fetched again.

Start analysis and confirm removal in Studio. Manually dispatching or re-running an Actions job cannot replace administrator confirmation. Branch protections still apply, and concurrent changes require a new analysis. Git history removal changes commit SHAs and does not erase external clones, GitHub caches, Discussions, Releases, images, or old build artifacts. Normal post deletion remains a separate operation.

## Translation workflow

1. Pages CMS stores source posts in `content/posts/*.md`.
2. GitHub Actions runs `npm run translate:content`.
3. DeepL is called only when a translation is missing, its source hash changed, or its schema version changed.
4. `PUBLIC_SITE_TAGLINE`, `PUBLIC_SITE_DESCRIPTION`, and `PUBLIC_SITE_FOOTER` are translated into `content/translations/<locale>/site.json`. Site copy uses automatic source-language detection.
5. Markdown bodies are converted to structured XML and translated with `tag_handling=xml`, `tag_handling_version=v2`, and `ignore_tags` so headings, lists, and code blocks stay intact.
6. Frontmatter `date` bypasses DeepL and keeps the exact source value.
7. Requests include custom instructions to preserve Markdown structure and frontmatter meaning where the target language supports them.
8. Generated files are committed under `content/translations/<locale>`.
9. Static building and Pagefind indexing continue in the same workflow.

Example configuration for Korean source content translated into English, Simplified Chinese, Japanese, and Arabic:

```sh
PUBLIC_SOURCE_LOCALE=ko
PUBLIC_TRANSLATION_LOCALES=en,zh,ja,ar
PUBLIC_RELEASE_LOCALE=en
PUBLIC_RELEASE_USE_TRANSLATIONS=true
```

To disable translation:

```sh
PUBLIC_SOURCE_LOCALE=ko
PUBLIC_TRANSLATION_LOCALES=
```

Default DeepL language mappings are built in. Override individual mappings with `DEEPL_SOURCE_LANG_<LOCALE>` or `DEEPL_TARGET_LANG_<LOCALE>`. Targets that do not support DeepL `custom_instructions`, such as Arabic, are translated without that option.

## Release workflow

- Each changed source post on `main` creates or updates a GitHub Release using a normalized `post-...` tag.
- Releases use the source post by default.
- With `PUBLIC_RELEASE_USE_TRANSLATIONS=true`, the release uses `PUBLIC_RELEASE_LOCALE` when a matching translated post exists.
- If the translation is missing, release generation falls back to the source post.

The initial browser locale follows these rules:

- Only the first visit to `/` checks the browser language or `localStorage.preferredLocale`.
- A configured translation locale redirects to `/<locale>/`; the source locale stays at `/`.
- Explicit locale paths such as `/en/...` or `/zh/...` are never forced back to the source path.
- The locale selector stores its choice in `localStorage.preferredLocale`.

## Giscus comments setup

Set `PUBLIC_GISCUS_ENABLED=false` to hide the entire comment area (including setup messages) and prevent loading the comment script/iframe. The default is `true`, including when the setting is absent or empty. Studio → Blog settings → Comments provides the same display toggle. Apply the latest template and redeploy for changes to take effect. This controls the blog UI only: connection IDs, existing comments, Discussions, and deployment discussion sync are preserved.

Post detail pages include Giscus comments. Public Giscus configuration lives in `.env.production`:

- `PUBLIC_GISCUS_REPO`: GitHub repository in `owner/repo` form
- `PUBLIC_GISCUS_REPO_ID`: repository ID required by Giscus
- `PUBLIC_GISCUS_CATEGORY`: GitHub Discussions category name
- `PUBLIC_GISCUS_CATEGORY_ID`: category ID

These values are public configuration and are committed in [`.env.production`](../../.env.production):

```sh
PUBLIC_GISCUS_ENABLED=true
PUBLIC_GISCUS_REPO=owner/repo
PUBLIC_GISCUS_REPO_ID=your-repo-id
PUBLIC_GISCUS_CATEGORY=General
PUBLIC_GISCUS_CATEGORY_ID=your-category-id
PUBLIC_SOURCE_LOCALE=ko
PUBLIC_TRANSLATION_LOCALES=en,zh,ja,ar
PUBLIC_RELEASE_LOCALE=en
PUBLIC_RELEASE_USE_TRANSLATIONS=true
```

Shell environment variables can temporarily override them locally:

```sh
PUBLIC_GISCUS_CATEGORY=Announcements \
npm run build
```

Setup:

1. Enable GitHub Discussions and resolve repository/category IDs using the [setup harness](setup.md).
2. For the default GitBlog provider (`PUBLIC_GISCUS_PROVIDER=gitblog`, `PUBLIC_GISCUS_HOST=https://gitblog.app`), include the blog repository in the [GitBlog App installation](https://github.com/apps/gitblog-app/installations/new) and approve Discussions access. A PAT does not grant the App access.
3. Only when explicitly using the upstream giscus provider, configure its App at [giscus.app](https://giscus.app). Do not mix one provider's host with the other provider's App.
4. Verify the widget on the deployed article as described in [provider verification](setup.md#verify-the-comment-provider).

The site theme toggle synchronizes automatically with the Giscus iframe theme.

The deployment workflow uses `giscus-post-<first 16 hex characters of SHA-256(post ID)>` as the Giscus `specific` mapping term and pre-creates one Discussion per source post with `scripts/sync-giscus-discussions.mjs`. Every localized route shares that thread. Discussion metadata prefers the English source or English translation when available and otherwise falls back to the source post.

## Customization and update preservation

Theme files live in `src/lib/theme`, user extensions in `src/lib/extensions`, and shared behavior in `src/lib/template`. Run `npm run update:check` for a build that verifies protected source files remain unchanged. Run `npm run test:template` to exercise custom CSS and extension points in a temporary copy. See [the customization guide](customization.md) for contracts, ownership, and migration limits.

### GitBlog integrated comment host

To use GitBlog's integrated comments, set `PUBLIC_GISCUS_PROVIDER=gitblog` and `PUBLIC_GISCUS_HOST=https://gitblog.app`. GitBlog connects the repository and category IDs automatically. Development mode permits localhost HTTP previews; production blogs require a public HTTPS URL.

For blogs created through GitBlog, all four comment repository/category configuration values are saved automatically when the app connection completes. If `PUBLIC_GISCUS_PROVIDER=gitblog` is set but the production host is empty, the comment area displays a setup-pending message. Installing the official Giscus app or entering IDs manually is not required.

## Template updates in GitBlog Studio

Open your blog in GitBlog Studio and select **Template updates**. The service compares the previous template snapshot, your blog, and the published stable revision, preserves user-owned files, and prepares an update PR. Apply it only after reviewing the changes and passing the `validate-update.yml` checks. Conflicting edits require manual reconciliation; this is a file-level merge, not an automatic framework or theme migration.

The template's `.gitblog/release.json` publishes a stable version and immutable commit SHA. Maintainers should commit and validate code first, then publish the release pointer in a separate commit. A blog's `.gitblog/template.json` is written by its update PR, recording the official revision for subsequent comparisons. See [the customization guide](customization.md) for preservation rules and older-blog limitations.

The GitBlog App needs Contents, Pull requests, Workflows, and Actions access on the target blog. Existing installations may need to approve the added permissions. No PAT or App private key is stored in this repository.

## Automatic GitBlog feed registration

With `PUBLIC_HUB_ENABLED=true` and `PUBLIC_HUB_URL=https://gitblog.app`, a successful Pages deployment calls the official, immutable `register-blog.yml` workflow. It verifies that this is a public blog created from the official template (or fork), reads the Pages address, and sends GitHub Actions OIDC proof. **Installing the GitBlog App is not required for feed registration.** GitHub access tokens are never sent to GitBlog.

Allow the official template's reusable workflow and `id-token: write` in your Actions policy. Initial notification delivery retries up to four times. If it still fails, run **Actions → Sync GitBlog feed → Run workflow**, or deploy again. A blog with neither an installed App nor a successful first notification cannot be discovered automatically. Existing App-based discovery remains supported.

GitBlog records the notification before fetching public RSS immediately. Temporary RSS/CDN failures are retried from durable server state. The manifest and RSS include the build commit so an old cached response cannot replace the new deployment. Registered feeds also receive a daily fallback check. Set `PUBLIC_HUB_ENABLED=false` and redeploy to opt out; an already registered blog becomes hidden when GitBlog next reads its disabled manifest.

Older blogs need the updated deployment workflow, `scripts/hub-settings.mjs`, RSS/manifest build metadata, and the new `sync-hub.yml` workflow. Apply this template release through Studio's **Template updates**. Existing unsigned deployment hints remain supported for previously registered blogs. A failed feed registration job does not undo a successful Pages deployment.

### Blog dashboard analytics

The latest template sends visible page visits to GitBlog when `PUBLIC_HUB_ENABLED` and `PUBLIC_ANALYTICS_ENABLED` are enabled. The Studio dashboard shows 7/30-day views, daily visitor estimates, referral domains, popular posts, GitBlog referrals, subscribers, bookmarks, and the last 7 days of comments. Deploy this template update to start collecting direct visits; historical visits cannot be backfilled. Existing GitBlog referral counts remain available.

Set `PUBLIC_ANALYTICS_ENABLED=false` in `.env.production` (or disable **Blog visitor analytics** in Studio settings) to stop collection without leaving the feed. Do Not Track and Global Privacy Control also disable collection. Analytics uses no cookies or local storage, and never stores raw IP addresses, user agents, or URL query strings. Server-side HMAC identifiers rotate daily, and the short-lived counters are removed after 31 days. Visits to the same page within 10 minutes are deduplicated. A period's visitor total is the sum of daily estimates, not unique people across the entire period. Referrers are stored as domains only. Custom pages outside the template's standard routes are not counted.

### Blog name and image

Set `PUBLIC_SITE_TITLE` to the display name of your blog, independently of the GitHub repository name. `PUBLIC_SITE_IMAGE` is an optional public HTTPS image URL used on GitBlog blog cards and the blog header. Studio can upload a PNG, JPEG, GIF or WebP (up to 5 MB) to `static/uploads/blog/` in your repository and save its URL when creating or configuring a blog. Removing the image setting restores the title initial; uploaded files and Git history are preserved. The GitBlog manifest publishes both fields so app-free blogs can update their identity through deployment notifications and feed collection.

## Shorts article excerpts

RSS includes an optional `hub:bodyExcerpt` field containing real article prose, separately from the existing description. The build gathers opening paragraphs until approximately 800 Unicode characters are available, with a maximum of 1,200 including spaces and paragraph breaks. Short articles stay intact. Section headings are retained with their following prose; article titles (H1), fenced code, images, tables, and raw HTML are skipped. Long paragraphs are cut at a sentence boundary when possible. Content files are not rewritten. The field is XML-escaped plain text; consumers must never execute it as HTML.

The full feed stays within the hub's 2 MiB limit by budgeting excerpt bytes per article. An excerpt may be shortened or omitted when space is limited; published articles are never removed from the feed to make room. Existing blogs receive this feature after updating and deploying the template; the hub must also support the new field. Run `npm run test:body-excerpt` for extraction checks and `npm run test:template` for the built RSS integration check.

### GitBlog related article panel

Article pages load the independently deployed GitBlog Related SDK from
`PUBLIC_HUB_URL/related/v1/index.js` (default: `https://gitblog.app`). The panel
appears directly after the existing `.related-boundary` list. It recommends public
GitBlog posts using tags, categories, and indexed article text, in the language of
the article being viewed. The original post UUID and the same repository identity
as the RSS manifest are sent to the API; GitHub Actions uses `GITHUB_REPOSITORY`,
with `PUBLIC_SITE_REPOSITORY` as the local fallback.

`PUBLIC_RELATED_ENABLED=false` disables the panel, and
`PUBLIC_RELATED_SHOW_THUMBNAIL=false` hides thumbnails. Both default to `true`.
`PUBLIC_RELATED_LIMIT=4` sets the maximum number of recommendations (1–8, default 4).
Fewer posts may appear when there are fewer matching articles.
Theme changes update the existing iframe without reloading the recommendation API.
Disabling `PUBLIC_HUB_ENABLED` also disables the panel. Theme changes follow the
blog's light/dark setting. Empty results, unindexed posts, unsupported legacy ULID
post IDs, and service failures leave no empty panel or heading. The SDK is loaded
in the browser; article builds do not call the recommendation API.

The managed article wrapper inserts the panel after `.related-boundary`, or at
the end of the article when that list is absent. Existing themes and environment
files stay unchanged during Studio updates; the panel and thumbnails are enabled
by default even when the new settings are absent. A theme that already renders
`GitBlogRelated` explicitly keeps its own placement without a duplicate panel.

## AI access and crawl checks

Manage independent search and training crawler preferences in GitBlog Studio. Published articles also offer Markdown and an optional `llms.txt` index. Builds check static readability and metadata; Pages deployments check the live host and upload a crawl report. See [configuration and hosting limits](ai-discovery.md) and [LLM writing guidelines](llm-writing-guidelines.md). These features do not guarantee indexing or AI citation.
