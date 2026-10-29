# Build-time image optimization

`npm run build` automatically optimizes local uploads after generating the static site. This
covers images added directly to `static/uploads/` and uploads from GitBlog or an external CMS.
The optimized copies are published from `build/uploads/`. Source files, Markdown, filenames,
extensions and public URLs stay unchanged. No new commits or API credentials are needed.

| Upload location                                         | Maximum width and height | Skip encoding when also at or below |
| ------------------------------------------------------- | ------------------------ | ----------------------------------- |
| `static/uploads/covers/`                                | 960 px                   | 250 KiB                             |
| `static/uploads/blog/`                                  | 384 px                   | 100 KiB                             |
| Other files under `static/uploads/`, including `posts/` | 1600 px                  | 500 KiB                             |

The aspect ratio is preserved and small images are never enlarged. JPEG uses quality 80,
WebP quality 80, and AVIF quality 55. PNG uses lossless compression after any required resizing,
preserving transparency. EXIF rotation is applied when an image is rewritten. A converted file
is used only if it is smaller than its input; byte budgets are skip thresholds, not guaranteed
output sizes. Large, detailed PNGs can remain above the budget to preserve their format and quality.

## Avoiding repeated compression

- Images already within both the dimensions and byte budget are copied byte-for-byte. This
  includes images prepared by GitBlog's browser uploader with its existing upload limits.
- For larger files, a SHA-256 cache reuses the previous encoding when the input and processing
  settings match. A changed file at the same URL is processed again. Re-running the optimizer
  on its output recognizes the output hash and does not encode it again.
- `.cache/gitblog-images/` contains the local cache; the deployment workflow restores it between
  GitHub Actions runs. Unused cached images are removed. The cache is ignored by Git and is not
  part of the published site.
- If the cache is unavailable, a clean build starts from the unchanged repository original.
  It never repeatedly compresses the source file.

An arbitrary external file does not reliably reveal whether another tool compressed it before.
The size/dimension budgets and known content hashes are the criteria, rather than the extension
alone. An externally compressed image that still exceeds a budget may be optimized once by this
pipeline. Files within the budgets are not re-encoded, even if they have no optimization metadata.

## Scope and checks

JPEG, PNG, WebP and AVIF are supported. GIF, SVG, animated/multipage images, symlinks and files
whose format does not match their extension are left unchanged. External image URLs and assets
outside `static/uploads/` are not fetched or modified. Point external CMS uploads at
`static/uploads/` to include them. Development mode serves originals; preview a production build
to see optimized assets.

Processing is sequential and limited to 50 MiB and 64 megapixels per input. Oversized or invalid
inputs produce a build warning and retain their original bytes; fix these files separately if
they make the Pages artifact too large. Disk/cache write failures fail the build.

```sh
npm run build             # Includes optimization and the normal publishing checks
npm run images:optimize   # Recheck an existing build/uploads directory
```

Existing blogs receive this feature after applying the template update and redeploying.
Repository storage usage is unchanged because originals are retained; only generated Pages
assets are reduced.
