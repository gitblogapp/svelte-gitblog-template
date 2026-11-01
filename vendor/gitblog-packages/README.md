# GitBlog package snapshot

These npm-compatible 0.2.0 archives are built and tested from the sibling `gitblog-template-packages` source repository. This version is not yet published to npm. Keeping the small archives in the repository makes clean installs and template exports reproducible without publishing credentials or absolute local paths. `SHA256SUMS` and the package lock record integrity.

Edit the shared package source, run `npm run build`, `npm test` and `npm run pack`, then refresh all consumers together. Do not edit archive contents or generated JavaScript. After publishing the exact tested version, replace the file dependencies with exact npm versions, regenerate lockfiles, and remove these snapshots. Never overwrite a published npm version or release asset.
