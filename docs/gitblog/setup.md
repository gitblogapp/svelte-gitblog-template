# First launch with an LLM

Before creating the first post or deploying a new blog, configure `.env.production` for the user's repository. The template's title, domain, repository, and language choices are examples, not user decisions. Read this guide when the user asks to launch a blog; ordinary post-writing tasks must preserve established site settings.

The setup harness discovers repository facts, returns questions as JSON, applies the user's answers, enables Discussions for the chosen comments setting, and configures GitHub Pages. The LLM asks the questions in the conversation and passes the answers to the harness. The CLI deliberately does not wait for interactive terminal input.

## Authenticate once

Install Node.js 24.12 or newer, Git, and [GitHub CLI](https://cli.github.com/). Create a personal repository with **Use this template**, clone it, and run `npm ci`. The deployment workflow uses `main` as the default branch.

Reuse existing working GitHub authentication. If authentication is missing, offer browser login or a **Fine-grained personal access token**, following [the GitHub authentication guide](github-auth.md). That guide includes token issuance steps, repository permission choices, private local `GH_TOKEN` input, credential inheritance for agents, and troubleshooting. If the user chooses a PAT, guide them through issuance and setup in their language instead of requiring browser login. Never ask them to paste the token into chat.

For a first launch, the token needs Contents write and Actions read, plus Pages write and Administration write for Pages configuration and Discussions activation. Include Discussions read when discovering comment categories. Routine publication needs Pages read rather than setup administration permissions; workflow file changes additionally need Workflows write. Use the guide's operation-specific table instead of automatically broadening access. GitHub also requires the user's repository role to permit managing Pages. If setup permissions are unavailable, the user can configure Pages and Discussions in GitHub themselves, then rerun discovery and `site:pages:status`.

Keep existing working SSH access when appropriate; GitHub CLI also needs API authentication. Verify authentication in the environment that actually runs the agent and harness. Keep credentials out of repository files, answers, remote URLs, and logs.

## Discover values and ask only unresolved questions

```sh
npm run site:setup
```

This reads the Git `origin` push repository and GitHub repository, Pages, and discussion category metadata. It does not change local files or GitHub settings. It rejects the upstream template repository and other repositories marked as templates. Use `--from .gitblog/work/setup.json` to preview a partial or complete set of answers.

| Setting                      | How to obtain it                                                                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_SITE_TITLE`          | Ask the user. Suggest the existing title or repository name.                                                                                                            |
| `PUBLIC_SITE_URL`            | Ask whether to use the suggested Pages address or a custom domain they control. Use an absolute HTTPS URL.                                                              |
| `PUBLIC_SITE_REPOSITORY`     | Infer `owner/repo` from the single `origin` push URL; do not invent it.                                                                                                 |
| `PUBLIC_SOURCE_LOCALE`       | Ask for the language of original posts. Do not infer it solely from the conversation language.                                                                          |
| `PUBLIC_TRANSLATION_LOCALES` | Ask for the target languages. An explicit empty string means no translations.                                                                                           |
| `PUBLIC_GISCUS_REPO`         | Use the same repository when comments are enabled.                                                                                                                      |
| `PUBLIC_GISCUS_REPO_ID`      | Read GitHub's repository node ID. This is not the numeric REST repository ID.                                                                                           |
| `PUBLIC_GISCUS_CATEGORY_ID`  | Resolve from the repository's discussion categories. Reuse a valid configured ID, prefer Announcements, or use the only category. Ask when selection remains ambiguous. |
| `PUBLIC_GISCUS_CATEGORY`     | Save the resolved category name alongside its ID.                                                                                                                       |

The JSON result contains `questions`, `proposed`, `changes`, `errors`, and `warnings`. Ask the user for the unresolved `questions`, preferably together. Values explicitly supplied earlier in the conversation already count as answers; do not ask again. Do not fabricate IDs or silently accept template defaults. A successful `site:configure` records confirmed choices in `.gitblog/setup.json`, so unchanged choices do not require repeated questions.

Also ask whether comments should be enabled. When enabled, the repository must be public and Discussions must be enabled. If Discussions are disabled, discovery reports `stage: "needs_discussions"` once the other answers are valid. Run `site:configure` to enable Discussions through `gh api`, verify the setting by reading it back, and discover the real categories. Do not ask the user to toggle it manually when the existing authentication can do so. If category selection remains ambiguous, answer the returned question and rerun `site:configure`. If no category exists, create a suitable one in GitHub and rerun discovery. The default provider is GitBlog, as configured by `PUBLIC_GISCUS_PROVIDER` and `PUBLIC_GISCUS_HOST`; keep those values unless the user requests another provider. Ensure that the selected provider's GitHub App is installed/authorized for the repository. Looking up IDs does not prove that the comments integration works. For the upstream giscus provider, follow [giscus configuration](https://giscus.app/).

To temporarily hide an already connected comment UI, use `PUBLIC_GISCUS_ENABLED=false` in `.env.production` or the Studio comment display setting. This preserves connection IDs and Discussions; `site:configure` preserves this independent visibility preference.

When comments are explicitly disabled, the harness clears the repository, IDs, and category name. It does not disable Discussions or uninstall any app. A separate comment repository is not supported by this launch flow because the existing workflow's `GITHUB_TOKEN` cannot sync discussions in another repository.

## Verify the comment provider

`PUBLIC_GISCUS_ENABLED=true` controls visibility only. `site:setup` and `site:configure` report `commentsIntegration.status: "not_verified"` even when the repository IDs and Discussions are ready. The author's `gh` login or PAT and the workflow's `GITHUB_TOKEN` do not grant a separate provider App access.

Run `npm run site:app:status` after configuration. Follow [GitBlog App connection](github-app.md) for both GitHub login and Fine-grained PAT, installation/organization approval, optional authorized repository addition, and status interpretation. The command is read-only and does not forward author credentials to the provider. Rerun it after the owner completes approval; `accessible` verifies App access while the live widget still needs checking. Network/service errors remain `unknown`, not a missing installation.

For the default `PUBLIC_GISCUS_PROVIDER=gitblog` and `PUBLIC_GISCUS_HOST=https://gitblog.app`:

1. Open [GitBlog App setup](https://github.com/apps/gitblog-app/installations/new). The repository owner selects the blog's owner/organization and adds the actual blog repository to the installation. An installation limited to selected repositories does not automatically cover a newly created blog. Ask the owner to approve any required access; do not grant or broaden it silently.
2. Confirm the installation has Discussions write permission and that the repository is public with Discussions enabled. Installing the upstream giscus App is not a substitute for the GitBlog App used by this host.
3. After deployment, open the real article, scroll to comments, and verify that the widget loads its discussion or a legitimate empty-discussion state. An App setup notice means access is still missing. A 500 is a provider error, not proof that `PUBLIC_GISCUS_ENABLED` is off. Report comment readiness separately from a successful build or deployment.

For an explicitly chosen upstream provider (`giscus` / `https://giscus.app`), use [giscus configuration](https://giscus.app/) and that provider's App instead. Preserve the chosen host; do not switch providers to hide an access error.

The Related panel is independent. `PUBLIC_RELATED_ENABLED=true` permits loading it, but the panel stays hidden while loading, when no relevant indexed articles match, or on a service error. Verify the recommendation response for the actual repository, original post ID, and locale before diagnosing a missing panel. An HTTP 200 with `items: []` and `emptyReason: "no-matches"` is an empty result, not a toggle failure; do not insert unrelated articles to fill it.

## Apply the answers and enable Discussions

Save the user's choices as JSON in the ignored `.gitblog/work/setup.json` directory. For example, after the user chooses these settings:

```json
{
	"PUBLIC_SITE_TITLE": "My engineering notes",
	"PUBLIC_SITE_URL": "https://notes.example.org",
	"PUBLIC_SOURCE_LOCALE": "ko",
	"PUBLIC_TRANSLATION_LOCALES": "en,ja",
	"comments": "enabled"
}
```

Use `comments: "disabled"` to omit comments. If category selection is needed, add `PUBLIC_GISCUS_CATEGORY_ID` from the returned choices, or `PUBLIC_GISCUS_CATEGORY` with the category name/slug. Repository and category IDs are looked up and verified automatically; do not copy IDs from another blog. Use plain single-line literal values; the harness rejects shell/env expansion characters instead of interpreting them.

```sh
npm run site:setup -- --from .gitblog/work/setup.json
npm run site:configure -- --from .gitblog/work/setup.json
npm run site:check
npm run site:app:status
```

`site:configure` refuses to write while known questions or validation errors remain. When comments are enabled and discovery reports `needs_discussions`, it first checks the local values and paths, then sends `PATCH /repos/{owner}/{repo}` with JSON `{ "has_discussions": true }` through the existing `gh` client. It reads the repository back before looking up categories; a successful PATCH alone is not treated as verified activation. Already enabled repositories need no PATCH, and disabling comments never disables Discussions.

It updates only the supported public keys, preserves unrelated configuration and comments, and writes `.gitblog/setup.json`. For a custom domain it writes `static/CNAME` containing only the hostname. For a standard `*.github.io` URL it removes a stale `static/CNAME`. It neither commits nor pushes. Its only remote change is enabling Discussions when needed; Pages configuration remains a separate command.

If activation succeeds but a category still needs selection, it reports Discussions as enabled and `applied: false`, leaving local settings unchanged until the question is resolved. This is a resumable operation, not an atomic transaction across GitHub and local files. On permission failure, check `gh auth status` and Administration write access, or manually enable **Settings → General → Discussions** before retrying. GitHub App installation/authorization remains separate.

Review the other template copy, owner, social links, and optional settings with the user as needed. Never erase their existing customization. For LLM-written translations, set `.gitblog/authoring.json` to `manual` as described in [authoring.md](authoring.md). Empty translation targets disable translated feeds; `PUBLIC_RELEASE_USE_TRANSLATIONS` only controls Release content.

## Configure Pages and the domain

For a launch or domain change already requested by the user, apply the reviewed configuration:

```sh
npm run site:pages
npm run site:pages:status
```

`site:pages` creates Pages when absent, selects the GitHub Actions build source, and sets the Pages `cname` to the hostname from `.env.production`. Switching to the repository's standard GitHub Pages URL clears the previous Pages custom domain. It reads the settings back and reports `configurationReady`; a denied API request is not treated as a successful configuration. `site:pages:status` only reads settings. These commands do not trigger deployment, edit DNS, or claim that the site is reachable.

GitHub Actions deployments **ignore CNAME files for domain configuration**. That is why the harness updates the Pages API as well as writing the file. `npm run build` derives `build/CNAME` from the effective production `PUBLIC_SITE_URL` without mutating source files. It removes stale CNAME output for GitHub's default domain. The build base path also follows `PUBLIC_SITE_URL`:

| URL                                                   | Build base | CNAME               |
| ----------------------------------------------------- | ---------- | ------------------- |
| `https://alice.github.io/blog`                        | `/blog`    | None                |
| `https://alice.github.io` for `alice/alice.github.io` | Empty      | None                |
| `https://notes.example.org`                           | Empty      | `notes.example.org` |

The setup flow accepts a custom domain assigned directly to the repository at the domain root. An explicit `SITE_BASE_PATH` remains available for test/preview overrides; omit it for normal deployment so it cannot conflict with the public URL.

The domain must belong to the user. For a subdomain, configure a DNS CNAME record pointing to `<owner>.github.io`, without the repository name. For an apex domain, follow GitHub's current A/AAAA or ALIAS/ANAME instructions. Configure domain verification and DNS at the relevant provider; a repository CNAME file is not a DNS record. The harness reports `dns: "not_verified"` until an independent check establishes connectivity. It does not infer DNS propagation or domain ownership from a successful API update.

HTTPS certificate issuance can take time. When GitHub reports an approved certificate, rerunning `site:pages` enables HTTPS enforcement. Report a pending certificate accurately rather than repeatedly rewriting settings.

## Write, verify, and deploy

After setup, follow [authoring.md](authoring.md) for posts and translations. Review and commit `.env.production`, `.gitblog/setup.json`, the generated `static/CNAME` (or its deletion), and any intentional authoring policy changes along with the requested content.

```sh
npm run author:verify
# Review and commit the intended files, then:
npm run author:deploy
npm run author:deploy-status -- 'PASTE_40_CHARACTER_COMMIT_SHA_HERE'
```

`author:deploy` checks local launch configuration and the actual Pages domain/build source before pushing. The deployment workflow also checks local launch settings before processing content. The generic build remains usable for template development and isolated fixtures without a live GitHub connection.

Report configuration, DNS/HTTPS, push, deployment, public-page verification, comment verification, and GitBlog ingestion separately. Do not equate `configurationReady` with a deployed blog, or `deployed` with completed ingestion.

## References

- [GitHub CLI login](https://cli.github.com/manual/gh_auth_login)
- [Git credential setup](https://cli.github.com/manual/gh_auth_setup-git)
- [Repository API and Discussions permissions](https://docs.github.com/en/rest/repos/repos#update-a-repository)
- [GitHub Pages API and permissions](https://docs.github.com/en/rest/pages/pages)
- [Custom domains and DNS](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
