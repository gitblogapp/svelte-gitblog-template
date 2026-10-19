# Connect the blog to GitBlog App

Use this flow during a first launch with GitBlog comments or when the owner requests reconnection. GitHub CLI browser login and a Fine-grained PAT both work with the harness. They authenticate the author; neither installs GitBlog App. The workflow's `GITHUB_TOKEN` also does not install it. A GitBlog account or feed registration is not evidence of App access.

## Discover, guide approval, and verify

1. Follow [GitHub authentication](github-auth.md) using the user's chosen method. Infer the actual blog from the single `origin` push URL. Create the user's repository from the template first; never install an App on the upstream template as a substitute.
2. Run `site:setup`, resolve only unanswered choices, and run `site:configure`. This enables Discussions and resolves the real repository/category IDs. Preserve the provider and comment visibility preferences.
3. Run `npm run site:app:status`. It reads repository metadata through the existing `gh` authentication and probes the default GitBlog provider without forwarding the author's credentials. It does not install, add repositories, create discussions, change local files, or register the blog in GitBlog.
4. For `needs_installation` or `needs_permissions`, explain the exact repository and show [Install/configure GitBlog App](https://github.com/apps/gitblog-app/installations/new). The owner selects the owning account, chooses **Only select repositories**, adds that blog, reviews the App permissions and approves **Install** or **Save**. Existing selected-repository installations do not automatically cover a blog created with ordinary `gh`/PAT credentials. Keep already selected repositories; do not replace the selection or choose all repositories for convenience.
5. Initial installation and permission approval happen in GitHub's browser UI even when the author chose PAT authentication. Explain that this is App approval, not a requirement to switch to `gh auth login`. Ask the owner to complete this step, then rerun `site:app:status`; their confirmation alone is not technical verification. Continue independent configuration/content work while approval is pending.
6. Once access is verified, follow the authorized publishing workflow. After deployment, open an actual article at its final URL and verify the comment widget loads a discussion or a legitimate empty state. Check custom-domain authorization and category configuration there. App access, widget readiness, deployment and GitBlog ingestion are separate results.

For organizations, the owner or an authorized administrator must approve according to organization policy. A repository administrator may need to request installation from the organization owner, particularly when the App requests Administration permissions. Pending approval is not successful installation. See [GitHub's installation guide](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party).

The GitBlog App permission screen is distinct from the PAT permissions. Comments require App Discussions **read/write**, plus the repository reads used by the provider; the repository must be public, active and have Discussions enabled. Review the full GitBlog App permissions shown by GitHub for its Studio/deployment features. If an existing installation is suspended or permissions need approval, resolve that installation rather than increasing the author's PAT scopes. Never request the App private key or an installation access token from the blog owner.

## Interpret the status

| Status                | Meaning / next action                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `accessible`          | The default provider verified App access, including Discussions write permission. `widget: not_verified` still requires checking the deployed article.                         |
| `needs_installation`  | The provider cannot find an installation covering this repository. Follow the installation link, then rerun.                                                                   |
| `needs_permissions`   | The provider found unsuitable or suspended App access. Review the installation's permissions/status.                                                                           |
| `needs_repository`    | Check public visibility, archived state and Discussions.                                                                                                                       |
| `needs_configuration` | Run setup/configure; verify actual repository and comment IDs/host.                                                                                                            |
| `unknown`             | Network, rate limiting, service failure, origin restriction or an unexpected provider response. Retry or inspect manually; do not treat it as proof of a missing installation. |
| `disabled`            | Hidden/disabled comments do not require this check. Do not turn them on or install an App unasked.                                                                             |
| `external_provider`   | The default GitBlog check does not apply. Verify the configured provider and its App manually; do not overwrite the host.                                                      |

Unresolved results exit nonzero. `ok: true` means this check passed or was not applicable, not that comments are fully working. The probe uses the owner's supported Pages origin to separate App access from custom-domain setup. It reads the existing server-rendered widget's structured state; an incompatible response becomes `unknown`. No persistent verification flag is stored: rerun after approval or configuration changes.

This is a launch/reconnection preflight, not a network dependency of every static build or feed registration. Do not report an enabled GitBlog comment integration as finished while verification is unresolved. If the owner explicitly wants to publish while setup is pending, report that limitation without silently disabling comments.

## Optional: add the repository to an existing installation with gh

Prefer the browser selection flow above: it works with either author authentication method and needs no extra PAT permission. Initial App installation cannot be created by this repository-add API.

When the user has authorized adding this exact repository to an **existing** GitBlog App installation, an agent may use GitHub's [add repository API](https://docs.github.com/en/rest/apps/installations#add-a-repository-to-an-app-installation). Establish the installation ID, owning account and App identity from the owner's GitHub installation settings; never guess an ID. Do not assume `GET /user/installations` works with a normal GitHub CLI OAuth token or Fine-grained PAT: that listing is for GitHub App user access tokens. Similarly, the repository-installation lookup requires App authentication, not the author's PAT.

The authenticated user must have repository admin access. For a Fine-grained PAT, GitHub documents **GitHub App installation repository access: write** for this optional API. Administration write alone is not equivalent. The PAT must include the actual repository and satisfy organization policy. If this permission is unavailable, approval is pending, or the API rejects the token, use the browser flow without switching authentication or broadening to all repositories. Browser `gh` login credentials are also subject to their granted scopes and user/organization permissions; successful login does not guarantee this write is permitted.

After verifying the owner, installation and authorization, replace the placeholders with verified numeric IDs (REST repository `id`, not the GraphQL `node_id`):

```sh
gh api --hostname github.com repos/OWNER/REPO --jq '{id, full_name, permissions}'
gh api --hostname github.com --method PUT \
  user/installations/INSTALLATION_ID/repositories/REPOSITORY_ID
npm run site:app:status
```

A successful add returns HTTP 204 with no body. Still rerun the provider check before claiming access. On 401/403/404, distinguish credentials, policy and resource identity; do not repeatedly issue writes or interpret a failure as an uninstalled App. This operation adds one repository, never removes others. It does not approve new App permissions or satisfy organization approval on the owner's behalf.
