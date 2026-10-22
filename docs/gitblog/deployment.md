# Deploy to your own hosting account

The repository and GitHub Actions belong to the blog owner for either provider.
Translation, image optimization, releases, comments and optional speech run before
uploading the same static `build/` output. Choose one production provider:

| `.env.production` key                 | GitHub Pages                                   | Cloudflare Pages                                                         |
| ------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| `GITBLOG_DEPLOY_PROVIDER`             | `github` (also the legacy default)             | `cloudflare`                                                             |
| `PUBLIC_SITE_URL`                     | Repository Pages URL or verified custom domain | Actual project `https://….pages.dev` URL or configured custom domain     |
| `CLOUDFLARE_ACCOUNT_ID`               | Unused                                         | Your 32-character Cloudflare account ID                                  |
| `CLOUDFLARE_PAGES_PROJECT`            | Unused                                         | Your Direct Upload project name                                          |
| Actions Secret `CLOUDFLARE_API_TOKEN` | Unused                                         | Token with **Account → Cloudflare Pages → Edit**, scoped to your account |

Never put the API token in `.env.production`, answers files, Git, chat, or a
`PUBLIC_` variable. Public settings contain account/project identifiers only.

## GitBlog Studio

Select a provider when creating a blog. GitHub Pages is configured automatically.
For Cloudflare, creation opens **Blog settings → Deployment settings**. Enter your
account ID, project name and token there. GitBlog checks the project (or creates
one), encrypts the token with the repository's GitHub public key and stores it in
that repository's Actions Secrets. It does not persist the token in GitBlog's
database. The repository needs GitBlog App Secrets write access and the current
user must have repository admin access.

Only Direct Upload projects with the repository's production branch are accepted.
A Git-integrated project needs a different project name: Cloudflare does not
convert its project type. The `.pages.dev` hostname returned by Cloudflare is used
as-is; it may differ from the requested project name.

Cloudflare setup is pending until account, project and public URL are present.
Pending workflows skip the build and deployment, rather than deploying to GitHub.
After connecting, subsequent pushes and Studio publication use the chosen host.

## Configure without Studio

Create a **Direct Upload** project in your own Cloudflare account. Set its
production branch to `main`, copy the actual `.pages.dev` URL, then configure the
public keys above. Save the API token privately with GitHub's repository
**Settings → Secrets and variables → Actions → New repository secret**. The token
is an account credential: limit it to the intended account and keep write access
to the repository restricted to trusted collaborators.

The setup harness accepts the three deployment keys in its answers JSON.
`site:configure` preserves unrelated settings and removes a source CNAME when
Cloudflare is selected. `site:pages` / `site:pages:status` check the presence of the
Actions Secret for Cloudflare; they do not create the project, validate the
secret's value or call the GitHub Pages API. A configured secret is not proof of
a successful deployment. GitHub Pages retains its existing setup behavior.

## Switch hosting and domains

Change the provider in Studio's deployment settings, or change the public keys and
push after preparing the destination account. No files or repository ownership
are moved. Old hosting projects are retained; a switch does not delete the old
site or its domain settings. Retire an old site in its provider dashboard after
verifying the replacement. Stored Cloudflare Secrets remain available for a later
switch; delete/revoke them if you no longer need that account connection.

GitBlog's automated `gitblog.page` address/proxy management currently supports
GitHub Pages. Disconnect that assignment and wait for cleanup before switching.
For a personal domain on Cloudflare, add it to the project's **Custom domains**
first, complete DNS/certificate checks, then save it as `PUBLIC_SITE_URL`. A CNAME
DNS record alone does not attach the domain to a Pages project. Cloudflare output
does not include GitHub's `CNAME` file and uses an origin without a project path.

After deployment, verify the site, `.well-known/blog-hub.json`, discovery audit,
comment embed and GitBlog registration. The official pinned registration workflow
reads Cloudflare's site URL from the deployed commit as data; it never executes
the blog's source with its registration identity. Older GitHub workflows remain
accepted by GitBlog. Hosting choice does not make a public repository private or
implement paid-article access control.

References: [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/),
[CI credentials](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/),
[custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).
