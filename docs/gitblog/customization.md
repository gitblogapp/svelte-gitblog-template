# Updates that preserve design and custom functionality

This document defines the customization boundaries of the current SvelteKit template. It does not introduce a general-purpose GitBlog SDK or a separate core repository.

## File ownership

| Area                                                           | Role                                                     | Update policy                                         |
| -------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| `content/`, `static/`                                          | Source posts, translations, images, and favicons         | Preserve during ordinary code updates                 |
| `src/lib/theme/`                                               | Active layouts and styles                                | Change separately from feature updates                |
| `src/app.css`, `src/app.html`                                  | User CSS entry point, fonts, and HTML settings           | Preserve                                              |
| `src/lib/extensions/`                                          | User components and page behavior                        | Preserve                                              |
| `.env.production`, `.pages.yml`                                | User site and CMS settings                               | Preserve                                              |
| `src/routes/`                                                  | Official route wiring and user-added pages               | Compare and merge changes; never delete unknown files |
| `package.json`, `package-lock.json`, build settings, workflows | Official and user dependencies and execution environment | Merge only the necessary changes                      |
| `src/lib/template/`                                            | Official page behavior, metadata, and extension wiring   | Update with compatibility checks                      |

The machine-readable policy lives in `.gitblog/update-policy.json`. `preserve` lists paths to retain during ordinary updates; `mergeOnly` lists paths that must not be replaced wholesale. A file's absence from this policy is not permission to delete it. GitBlog Studio detects user modifications to official files by comparing them with the previous official version.

**Ordinary Git merges do not apply this policy automatically.** GitBlog Studio applies the policy through a three-way comparison of each file and creates a separate update PR when there are no conflicts. If both the user and the template changed the same file, it requests review instead of automatically merging lines. Review diffs against this policy when using `Sync fork`, copying files, or performing ordinary Git merges as well.

## Documentation and user instructions

| Path                                              | Ownership                                                      | Update behavior                                                                              |
| ------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `README.md`                                       | Blog owner: introduction and links                             | Preserve exactly, including custom text or deliberate absence                                |
| `.gitblog/user-instructions.md`                   | Blog owner: audience, voice, editorial and working preferences | Preserve exactly; optional on upgraded blogs                                                 |
| `AGENTS.md`                                       | Stable agent entry point with possible local additions         | Merge-only; review conflicts instead of replacing local instructions                         |
| `docs/gitblog/`                                   | Official operating guides and template reference               | Update with the template; review local modifications using the existing three-way comparison |
| Older `docs/*.md` and `docs/readme/*` guide paths | Compatibility links                                            | Keep links to maintained guides so preserved READMEs remain useful                           |

Do not preserve all of `docs/` or `.gitblog/`: that would prevent official guides and update metadata from receiving fixes. Put personal rules in the user instructions file. These rules customize prose and recurring preferences; they do not bypass validation or credential handling and do not grant unrelated publication permission. The current user request takes precedence. Real configuration remains in `.env.production` and `.gitblog/authoring.json`.

When upgrading from the previous layout, Studio preserves the existing README and moves the maintained manual into `docs/gitblog/reference.md`. Former guide paths become compatibility links. If an old guide or `AGENTS.md` was edited locally, review the conflict and move personal rules into `.gitblog/user-instructions.md` before adopting the maintained guide or entry point. Do not discard those edits. The new optional user instructions file may remain absent because protected paths are not populated by an update; the harness handles this and never generates personal preferences automatically. Create it only when the owner wants to save their instructions. Newly generated repositories include a blank starter.

The preservation policy applies to GitBlog Studio updates. Ordinary Git merges, file copying, and other agents must explicitly honor the same ownership rules; Git itself does not enforce this policy.

## Editing the theme

- `SiteLayout.svelte`: Header, navigation, footer, overall layout, and theme-color.
- `HomeView.svelte`: Post list and filter layout.
- `ArticleView.svelte`: Layout for the title, cover, body, table of contents, comments, and related posts.
- `styles.css`: The existing design's complete CSS, retaining its variables and selectors.
- `src/app.css`: User entry point that imports the theme styles. Append custom CSS here.

`src/routes/+layout.svelte` delegates to the official `SiteShell`. `SiteShell` manages language navigation, dark mode, search state, and metadata. Themes receive a `SiteController` to invoke those behaviors. Preserve `bind:this={state.localeMenuEl}` on the language-menu container to retain outside-click handling.

Article components retain data and SEO handling while rendering `ArticleView`. The official `ArticleBody` displays the body HTML; `bind:element={article.element}` connects it to table-of-contents generation. When changing a theme, preserve `post-title`, the body reference, and `data-pagefind-body` so the table of contents and search keep working. Add appropriate Pagefind attributes to user components when their content should be searchable.

`src/lib/template/contracts.ts` defines the public type boundary. The current theme and extension API version is 1. New required props, removed slots, and changes to body DOM structure or selectors require compatibility review. Feature updates do not force theme changes. If you replace `ArticleBody` with a custom implementation, official body features will not automatically carry over; you must maintain compatibility yourself.

The shared search, comment, and related-post components have not all been separated into a fully independent theme engine. Changes to official component DOM can affect appearance even when CSS is preserved, so preview validation is still necessary.

## Registering custom functionality

Edit `src/lib/extensions/registry.ts`. Components render in registration order. No extra HTML wrapper is created when a component is absent.

```ts
import Newsletter from './Newsletter.svelte';
import type { BlogExtension } from '$lib/template/contracts';

export const extensions: BlogExtension[] = [
	{
		id: 'newsletter',
		apiVersion: 1,
		components: {
			'article-after-body': Newsletter
		}
	}
];
```

`Newsletter.svelte` receives data as follows:

```svelte
<script lang="ts">
	import type { ExtensionContext } from '$lib/template/contracts';
	let { context }: { context: ExtensionContext } = $props();
</script>

<aside aria-label="Newsletter">
	<p>Thank you for reading {context.post?.title}.</p>
</aside>
```

Supported positions:

- `article-before-body`: After the cover, immediately before the body.
- `article-after-body`: After the body, immediately before comments.
- `site-footer`: After the site footer.

Every position receives `site`, `locale`, and `pathname`. Article pages also provide `post`, which may be absent on other pages. New themes must render these positions for registered components to appear.

Register page-specific browser behavior with `onPage`. It does not run during SSR. When the current page context changes, the previous cleanup function runs before initialization; cleanup also runs when the site shell is removed. Use the returned cleanup function to release event listeners, timers, and external widgets. Do not implement page-specific behavior solely with `onMount` in persistent layouts that may survive page navigation.

```ts
{
  id: 'reading-tools',
  apiVersion: 1,
  onPage(context) {
    if (!context.post) return;
    const listener = () => { /* Custom behavior */ };
    window.addEventListener('scroll', listener, { passive: true });
    return () => window.removeEventListener('scroll', listener);
  }
}
```

Duplicate IDs and unsupported API versions fail the build. Failed extensions are not silently hidden. Type checking alone does not guarantee functional compatibility.

## Validation without modifying content

```sh
npm run update:check
npm run test:template
```

`update:check` performs these steps:

1. Records paths and byte hashes for files covered by preservation and merge policies.
2. Runs existing tests, read-only post ID validation, and Svelte type checks.
3. Runs the static build, GitBlog contract validation, and Pagefind indexing.
4. Checks protected files for additions, modifications, and deletions, whether validation succeeds or fails.

Build artifacts such as `build/` and `.svelte-kit/` are generated. The command does not invoke translation, ID generation, file cleanup, GitHub writes, or deployment. It is not a sandbox that blocks writes. If a user build plugin changes protected files, validation detects the change and fails without automatically restoring files, which could discard user work. Editing files during validation is also detected as a change.

`test:template` registers user CSS, extension components, and posts in a temporary copy and tests an actual build. It checks project Pages base paths, positions before and after the body and after the footer, post ID propagation, Google verification metadata, and source preservation. It does not modify the original blog.

`.github/workflows/validate-update.yml` validates PRs with read-only permissions. The separate `deploy.yml` publishing workflow performs content preparation according to the authoring policy, followed by Discussion and Release synchronization. In DeepL mode, ID backfill and translation commands retain their existing behavior of deleting translations with no source post. **Do not use the publishing workflow to preview a migration.** Review content-changing publishing operations separately. See the [authoring guide](authoring.md) for manual mode, which validates content without generating or deleting translations.

## Migrating existing customizations

1. Record the current repository commit, files, URLs, post IDs, and representative screenshots as a baseline.
2. Move user changes from existing `+layout.svelte`, article and list components, and `app.css` into the theme area instead of overwriting them with official files.
3. Register added functionality in the extension registry and preserve user-added pages, dependencies, and CMS fields.
4. First verify that the existing appearance and behavior are preserved. Do not mix new design or feature changes into this step.
5. Apply subsequent official feature updates in a separate PR. Keep the existing deployment if conflicts or compatibility checks fail.

There is no automatic conversion for deeply customized blogs yet. Matching theme API versions do not remove the need for visual comparisons and checks of custom functionality. When rolling back, revert only the update changes so posts written afterward remain intact.

## Updating through GitBlog Studio

Use **Template update** in blog management. Studio analyzes the stable version published in `.gitblog/release.json` and prepares a PR that preserves posts, images, settings, themes, and extensions. Apply it in Studio after `validate-update.yml` succeeds and you have reviewed the changes. If a new post is written or the PR changes before application, run the analysis again. Resolve code conflicts on GitHub while preserving user changes, then reanalyze.

The first update uses the initial commit of a blog created from the template as its baseline. Successfully applied versions are recorded in `.gitblog/template.json`. Forks, repositories with an unknown baseline, and versions with a different API or a structure predating theme separation are not migrated automatically. Identify the repository's actual official baseline commit or migrate existing customizations first. Framework replacement and theme redesign are outside this update's scope.

Maintainers should validate and commit code changes before publishing the version and revision in `.gitblog/release.json` in a separate commit. The revision must be a publicly available 40-character GitHub commit SHA. Do not prepopulate `.gitblog/template.json` in the template: it records the version applied to each individual blog. New blogs also use their initial creation commit to identify the baseline.

First-launch choices are recorded in `.gitblog/setup.json` and preserved during updates. See [setup.md](setup.md) before changing `.env.production` or a Pages domain. Builds derive the base path and output CNAME from `PUBLIC_SITE_URL` without rewriting the source configuration.

### Taxonomy preservation

`content/taxonomy.json` is blog-owned content, including stable IDs, cached translations, aliases and tag separation overrides. The existing `content/` preservation rule covers it. An update must not regenerate, replace or remove this dictionary. Ordinary builds and update checks read it without writing; only explicit taxonomy synchronization or publishing translation workflows extend it. See [taxonomy](taxonomy.md).
