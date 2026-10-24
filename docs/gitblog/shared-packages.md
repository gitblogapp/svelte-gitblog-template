# Shared packages

This template consumes `@gitblogapp/core`, `@gitblogapp/cli`, and `@gitblogapp/browser` from the public npm registry, pinned to version `0.1.1`. The package lock pins their integrity. There are no local sibling-directory dependencies in released templates.

Use `npm ci`; no npm login or private package token is needed to install. Package source and release artifacts live in [gitblog-template-packages](https://github.com/gitblogapp/gitblog-template-packages). Existing authoring, deployment and configuration commands remain unchanged. Framework routes, environment adapters, theme and personal extensions stay in this repository. Shared policy fixes now originate in gitblog-template-packages; update the exact dependency versions and lockfile together and run the existing validation suite before releasing a template.

The initial shared baseline is Svelte 1.13.2. Both templates now support membership public stubs/readers, related posts, analytics, translated speech for supported languages, build-output image optimization, and GitHub/Cloudflare Pages configuration. Credentials remain in Actions Secrets or GitBlog, never these packages.

TTS inference remains in `scripts/tts` and the workflow; full speech files stay in the user's Git repository, outside the Pages artifact. `tts-input.json` is an intermediate build file removed before deployment. No private membership speech is generated.
