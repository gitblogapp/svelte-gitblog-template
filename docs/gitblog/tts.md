# Article and Shorts speech

Supertonic 3 runs on the standard CPU GitHub Actions runner when the blog deploys.
No speech API key or paid inference subscription is required. Enable it in GitBlog's
blog settings → TTS, or in `.env.production`:

```dotenv
PUBLIC_TTS_ENABLED=true
PUBLIC_TTS_VOICE=F1
```

Choose F1–F5 or M1–M5. GitBlog provides generated voice samples. The post editor's
TTS checkbox overrides the blog default for that post; a blank post voice inherits
the blog voice. The corresponding Markdown frontmatter is:

```yaml
tts: true
ttsVoice: F2
```

Omit `tts` to inherit the blog default. Set `tts: false` to suppress the full article
player. This does not suppress GitBlog's separate narration of the indexed excerpt.
Korean, English and Japanese are supported; Supertonic 3 does not support Chinese.
Unsupported languages continue to publish as text.

## Translated posts

Both DeepL and manual translations generate excerpt and full audio in the translated
page's language. Every translation inherits the source post's TTS switch and voice,
including older translations without TTS frontmatter. Copied translation TTS fields
do not override the source. Normal manual translation acceptance/freshness checks
still apply; the speech build never edits or translates Markdown.

The pinned model supports these language codes:
`ar bg hr cs da nl en et fi fr de el hi hu id it ja ko lv lt pl pt ro ru sk sl es sv tr uk vi`.
Regional variants such as `en-US` and `pt-BR` use their base language. Each page is
checked independently: an unsupported source language can have supported translations.
Unsupported pages publish `enabled: false` with no audio URLs, do not generate files,
and show no player, even if an old manifest contains audio. Text remains available.
The allowlist shared by the build and CPU engine is `scripts/tts/languages.json`.

## Build and storage

The deployment first builds the final RSS excerpt, then generates excerpt and full
audio. Unchanged text/voice/model hashes reuse existing files. Audio is committed to
`content/audio/<sha256>.mp3` plus `content/audio/manifest.json`. A second build adds
the article player. These files are outside `static/` and do not enter the Pages
artifact. The player uses a public GitHub Raw URL in the deploying repository.
This requires a public repository accessible without authentication.

Excerpts are mono 24 kHz MP3 at 48 kbps (maximum 3 MiB). Full articles use 64 kbps
(maximum 48 MiB and 60,000 spoken characters). Code blocks and markup are excluded
from narration. Failed synthesis does not prevent ordinary article publication;
the player appears only for a matching generated file. Generation adds deployment
time. Old audio stays in Git history; periodically review repository growth.

`.well-known/tts.json` publishes version 1 entries with `postId`, `locale`, `voice`,
`textHash`, `previewUrl` and `fullUrl`. The text hash uses the final RSS `hub:bodyExcerpt`
or summary: normalize CRLF, collapse inline spaces and excess blank lines, trim, then
cap at 1,200 Unicode code points. GitBlog imports only a matching excerpt from the
indexed repository into R2. Full audio remains in your repository.

`.well-known/tts-input.json` is a build input containing speech text; the deployment
removes it before uploading Pages. Do not add `content/audio` to static build assets.

The separate `platform-speech.yml` workflow consumes GitBlog's central excerpt queue
only in the official `gitblogapp/svelte-gitblog-template` repository. It skips all user
copies. GitBlog authenticates this workflow with short-lived GitHub OIDC, so no R2
credentials or GitBlog service secrets are distributed to blog owners.

## Model and licensing

The CPU engine and model are pinned in `scripts/tts/`. Source helper code is MIT
(`scripts/tts/vendor/LICENSE`); downloaded Supertonic 3 weights keep their OpenRAIL-M
license. Setup retains the model license with the cache. Review the license when
changing models. Voice samples are synthetic, without voice cloning.

Standard hosted Actions are free for public repositories; private repositories use
their owner's included minutes and any configured billing. See
[GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## Article player

The full-article player follows the blog's existing light/dark theme tokens. It offers
play/pause, an accessible seek bar, elapsed/total time and 0.75×–2× playback speed.
Controls use the article's UI language. Audio loads only after play; articles do not
autoplay. Without JavaScript the browser's native controls remain available. Leaving
an article stops its audio. A failed load can be retried with the play button.

GitBlog Shorts uses a separate excerpt player: the square button beside the bookmark
controls play/pause. It attempts autoplay for each active item and resets when leaving
that item. Browsers may require an initial play-button tap before allowing audible
autoplay. Full article audio remains in the user's repository, as described above.
