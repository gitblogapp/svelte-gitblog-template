# First launch with an LLM

Before creating the first post or deploying a new blog, configure `.env.production` for the user's repository. The template's title, domain, repository, and language choices are examples, not user decisions. Read this guide when the user asks to launch a blog; ordinary post-writing tasks must preserve established site settings.

The setup harness discovers repository facts, returns questions as JSON, applies the user's answers, and configures GitHub Pages. The LLM asks the questions in the conversation and passes the answers to the harness. The CLI deliberately does not wait for interactive terminal input.

## Authenticate once

Install Node.js 24.12 or newer, Git, and [GitHub CLI](https://cli.github.com/). Create a personal repository with **Use this template**, clone it, and run `npm ci`. The deployment workflow uses `main` as the default branch.

If GitHub authentication is not already available, the user runs:

```sh
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git --hostname github.com
gh auth status
```

Keep existing working SSH authentication when appropriate; GitHub CLI also needs authentication for API reads and Pages configuration. The agent must run in an environment that can use those credentials. Do not ask for tokens in chat, print tokens, put credentials in a remote URL, or save them in `.env.production` or the answers file. Use the OS credential store and check that `gh` did not fall back to plaintext storage.

Push access and Pages administration are separate permissions. A fine-grained PAT needs repository Contents write access for pushes and Actions read access for deployment status; Pages creation/update also requires Pages write and Administration write permissions. GitHub additionally requires an administrator, maintainer, or a role with permission to manage Pages. If those permissions are unavailable, the user can configure **Settings → Pages → GitHub Actions** and the custom domain themselves, then run `site:pages:status`. Do not automatically broaden token scopes.

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

Also ask whether comments should be enabled. When enabled, the repository must be public and Discussions must be enabled. If Discussions are disabled or no suitable category exists, finish that repository setup and rerun discovery. The default provider is GitBlog, as configured by `PUBLIC_GISCUS_PROVIDER` and `PUBLIC_GISCUS_HOST`; keep those values unless the user requests another provider. Ensure that the selected provider's GitHub App is installed/authorized for the repository. Looking up IDs does not prove that the comments integration works. For the upstream giscus provider, follow [giscus configuration](https://giscus.app/).

When comments are explicitly disabled, the harness clears the repository, IDs, and category name. It does not disable Discussions or uninstall any app. A separate comment repository is not supported by this launch flow because the existing workflow's `GITHUB_TOKEN` cannot sync discussions in another repository.

## Apply the answers locally

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
```

`site:configure` refuses to write while questions or errors remain. It updates only the supported public keys, preserves unrelated configuration and comments, and writes `.gitblog/setup.json`. For a custom domain it writes `static/CNAME` containing only the hostname. For a standard `*.github.io` URL it removes a stale `static/CNAME`. It neither commits nor pushes nor changes remote settings.

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
- [GitHub Pages API and permissions](https://docs.github.com/en/rest/pages/pages)
- [Custom domains and DNS](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
