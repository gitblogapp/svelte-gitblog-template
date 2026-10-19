# GitHub authentication for the LLM harness

The harness uses `gh` for GitHub API calls and Git for pushes. Reuse working authentication. When authentication is missing or the user wants to change it, offer browser login or a **Fine-grained personal access token (PAT)**. Honor the user's choice; do not require browser login after they choose a PAT. Explain the steps below in the user's language, using their actual repository owner/name once known.

## Choose an authentication method

Check `gh auth status --hostname github.com` without showing token values. Existing SSH access can remain in place for Git, but `gh` still needs API authentication.

For browser login, the user runs:

```sh
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git --hostname github.com
```

Use the OS credential store; check that `gh` did not fall back to plaintext storage. For a Fine-grained PAT, use `GH_TOKEN` as described below. GitHub CLI recommends this environment variable for fine-grained tokens; its `--with-token` instructions and `repo`, `read:org`, `gist` minimum scopes describe classic tokens, not the repository permissions below. See [GitHub CLI authentication](https://cli.github.com/manual/gh_auth_login).

## Help the user issue a Fine-grained PAT

1. First create the user's blog repository with **Use this template** on GitHub. The repository must exist before it can be selected for a token. Select the user's blog, not `gitblogapp/svelte-gitblog-template`.
2. Open [Fine-grained token creation](https://github.com/settings/personal-access-tokens/new), or go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
3. Enter a recognizable name such as `gitblog-my-blog`, an expiration appropriate for the work, and an optional description.
4. Set **Resource owner** to the account or organization that owns the blog. Under **Repository access**, choose **Only select repositories** and select that blog repository.
5. Under **Repository permissions**, add the permissions for the intended operations from the table below. Do not default to all repositories, account permissions, or organization permissions.
6. Generate the token and copy it directly into the user's local authentication prompt below. GitHub only shows the value at creation; if lost, replace it. Do not paste it into the conversation.

An organization may require approval or restrict token issuance and expiration. A pending token cannot perform the setup writes until approved. If the owner or repository is unavailable, check ownership, membership, and organization policy instead of silently broadening access. A token cannot grant more access than its user already has. See [GitHub's token creation and policy guide](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

## Repository permissions for this template

| Repository permission | Access                                             | When the harness needs it                                                                                                        |
| --------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Metadata              | Read-only (automatic)                              | Read repository identity and settings.                                                                                           |
| Contents              | Read and write                                     | Push posts, configuration, and other intended repository changes.                                                                |
| Actions               | Read-only                                          | Check deployment runs with `author:deploy-status`.                                                                               |
| Pages                 | Read-only for publishing; read and write for setup | `author:deploy` reads Pages settings before pushing. `site:pages` creates/updates Pages, its domain, and HTTPS settings.         |
| Administration        | Read and write for setup                           | Enable Discussions through `site:configure`; create/update Pages through `site:pages`. Not needed for routine posts after setup. |
| Discussions           | Read-only when comments are enabled                | Discover discussion categories and resolve Giscus options.                                                                       |
| Workflows             | Write, only when changing workflow files           | Push changes to `.github/workflows/*`, including template updates that modify workflows. Ordinary post edits do not need this.   |

For a **first launch with comments**, select Contents read/write, Actions read, Pages read/write, Administration read/write, and Discussions read. Metadata is included automatically. Add Workflows write only if the planned changes touch workflow files.

For **routine post publication on an already configured blog**, Contents read/write, Actions read, and Pages read are sufficient for the normal publishing commands. Keep Discussions read if comment category discovery is needed. Administration write is unnecessary unless repository or Pages settings need changing. The user can reduce setup permissions after launch.

These requirements follow the harness operations and GitHub's [repository update API](https://docs.github.com/en/rest/repos/repos#update-a-repository), [Pages API](https://docs.github.com/en/rest/pages/pages), [workflow run API](https://docs.github.com/en/rest/actions/workflow-runs), and [content/workflow permissions](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents). Pages setup also requires the user's repository role to permit managing Pages. Branch protection and organization policies still apply.

Do not request Actions write just to publish: `author:deploy` pushes to `main`, which triggers the existing workflow. Manual workflow dispatch/rerun or other additional operations may require extra permissions; explain the specific need before changing the user's access. The deployment workflow uses GitHub's built-in `GITHUB_TOKEN`, including its configured Discussions write permission for synchronization. Do not add the user's PAT to Actions secrets or replace that workflow token. Giscus provider app installation/authorization is separate from PAT authentication.

## GitBlog App installation is separate

Follow [GitBlog App connection](github-app.md) after configuring comments. Both authentication methods use `site:app:status`; initial App approval is completed on GitHub in a browser. Choosing a PAT does not remove that approval step or require changing the CLI login method. Prefer the browser repository-selection flow, which does not need additional PAT permissions. For an explicitly authorized API addition to an existing installation, GitHub documents the optional **GitHub App installation repository access: write** permission, in addition to the user being a repository administrator. Do not add it to the default setup token merely to check App access.

## Supply the token locally

The user enters the token themselves in a private, interactive terminal. The agent must not collect it through chat, tool arguments, screenshots, logs, or an answers file. Do not write it into `.env.production`, `.gitblog/work/`, shell startup files, Git remotes, or source files. Avoid shell tracing, `GH_DEBUG`, `gh auth token`, `gh auth status --show-token`, and environment dumps.

For **Bash or zsh**, run this in the terminal that will launch the agent or run the harness. Input is hidden and the token itself is not part of a shell command or its history:

```sh
set +x
unset GH_DEBUG
printf 'Fine-grained PAT (hidden): ' >&2
if IFS= read -r -s GH_TOKEN && [ -n "$GH_TOKEN" ]; then
  printf '\n' >&2
  export GH_TOKEN
  gh auth status --hostname github.com
else
  printf '\nNo token entered. Stop here and retry.\n' >&2
  unset GH_TOKEN
fi
```

Continue only after successful authentication. For HTTPS Git access through this token, run:

```sh
gh auth setup-git --hostname github.com
```

Preserve working SSH authentication if the user uses SSH. In that case Git pushes use the SSH key and `gh` API requests use the PAT; they may authenticate as different accounts, so verify access for both before publishing.

`GH_TOKEN` is read directly by `gh`; no additional `gh auth login` is necessary. It takes precedence over `GITHUB_TOKEN` and stored credentials for github.com, as documented in [GitHub CLI environment variables](https://cli.github.com/manual/gh_help_environment). The token is available to child processes of this shell. Launch the CLI agent from this same shell, or run the harness commands here. An already running desktop agent does not inherit an export from another terminal: use that application's supported secret/environment injection facility, or relaunch it in an environment that actually inherits the variable. Do not claim authentication is ready until checks pass in the agent's own execution environment.

This shell setup is temporary; new sessions need the token again. For repeated use, the user may use a trusted secret manager to supply `GH_TOKEN` to the agent process. Do not persist it in plaintext as a convenience. Other shells need an equivalent private input/secret injection mechanism; do not paste the token into a command line.

## Verify and continue

Run these read-only checks in the environment that will execute the harness. Replace `OWNER/REPO` with the actual blog repository inferred from `origin`, without credentials in the URL:

```sh
gh auth status --hostname github.com
gh api --hostname github.com user --jq .login
gh api --hostname github.com repos/OWNER/REPO --jq '{full_name, permissions}'
npm run site:setup
```

A successful public repository read or the returned `permissions` object does not prove that the PAT has every required write permission. Check the selected token permissions and report an operation as successful only after its actual result is verified. Continue with [setup](setup.md) or [authoring](authoring.md) according to the user's existing request; do not create a throwaway write merely to test authentication.

| Symptom                                        | What to check                                                                                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `401` / bad credentials                        | Expired, revoked, or mistyped token; have the user replace it locally.                                                                   |
| `403` / resource not accessible                | The operation's repository permissions, organization approval/policy, and the user's own repository role.                                |
| `404` / repository not found                   | Actual owner/name, selected repository access, and whether GitHub is hiding an inaccessible resource.                                    |
| Categories unavailable                         | Discussions enabled, Discussions read access, and the chosen repository; then follow setup's category selection.                         |
| Git push denied while `gh` works               | HTTPS credential helper versus SSH identity, Contents permission, branch protection, and Workflows permission if workflow files changed. |
| Works in the user's terminal but not the agent | Whether the agent process inherited `GH_TOKEN`; do not print its value to debug.                                                         |

If setup permissions are unavailable, the user can enable **Settings → General → Discussions** and configure **Settings → Pages → GitHub Actions** and the domain themselves. Rerun discovery and `site:pages:status`; do not claim the harness performed those changes. Do not silently switch authentication methods or broaden token access.

When finished, `unset GH_TOKEN` removes the value from the current shell only. It does not revoke the token, remove it from already running child processes, or log out stored GitHub accounts; `gh` may then fall back to another credential. Revoke or rotate the token in GitHub's token settings when it is no longer needed or if exposed.
