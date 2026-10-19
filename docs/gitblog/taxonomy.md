# Multilingual tags and categories

Users can keep entering one category and multiple tags in GitBlog Studio, Pages CMS or Markdown. Post frontmatter keeps those original references. Rendering resolves references through the blog-owned `content/taxonomy.json` dictionary; translated pages, RSS and search use the localized labels. Do not replace taxonomy references inside translated post frontmatter: the authoring validator intentionally preserves them.

## Deployment and automatic translation

`npm run translate:content` in DeepL mode collects new names from source posts and `content/categories` / `content/tags`. It translates only missing dictionary labels, including English as the comparison language and all configured target languages. Short labels use language detection with the blog description as context. It never overwrites existing labels, aliases or IDs. The deploy workflow commits the dictionary alongside translated posts before building.

With no translation targets and no DeepL key, collection still works, but missing English labels cannot be guessed and those tags remain separate. Supplying a key enables taxonomy translation even for a single-language blog. A multilingual deployment with missing labels requires the key or manually completed dictionary labels. Ordinary `build`, `author:check` and update validation do not write the dictionary or call a translation service.

## Dictionary and merging

Run `npm run taxonomy:sync` to create or extend the dictionary and list missing labels. This command does not call DeepL. It assigns stable IDs without changing any post. Example entry inside the `tags` array:

```json
{
	"id": "tag-existing-id",
	"source": "비트코인",
	"labels": { "ko": "비트코인", "en": "Bitcoin", "ja": "ビットコイン" },
	"aliases": ["BTC"]
}
```

Keep generated IDs and the existing array order. New entries append to the dictionary. A source reference can use the original name or an explicit existing ID. When renaming a source name, keep the old name in `aliases` so existing posts still resolve. Do not change `sourceLocale` without an explicit migration of the source-language labels.

Tags with the same normalized English label form one group. Normalization uses Unicode NFC, case folding to lowercase and whitespace normalization; it preserves punctuation (`C++` and `C#` remain different). A group uses its first dictionary member's stable ID and localized label, with all members' source names, translations and explicit aliases available for search. Thus `비트코인` and `bitcoin` can share a group; `Bitcoin Cash` stays separate. Multiple equivalent tags on one post display only once.

To prevent a false merge, set `"separate": true` on the affected tag entry. Its ID then stays separate even if its English translation matches. Shared words may still match both groups in free-text search; selecting a group's ID filters that group. Do not add ambiguous aliases automatically. Translation equality is a useful default, not proof that two concepts are identical.

Categories never merge by translated names. Each category keeps its own ID and localized labels. The homepage disambiguates identical translated choices using their source names; selecting a category uses its ID. Language switching preserves tag/category filter IDs.

## LLM translation workflow

1. Run `author:context`, then `taxonomy:sync` after editing source taxonomy or adding classifications.
2. Read `content/taxonomy.json` and the blog's topic context. Fill missing `labels` for English, the source language and every configured target language. Translate categories as well as tags; preserve proper names and distinguish related concepts.
3. Reuse established labels across all posts. Preserve existing IDs, source names, order, aliases, user corrections and separation overrides. Do not regenerate the dictionary. Resolve ambiguous terms with the user when context is insufficient.
4. Run `npm run taxonomy:check`. It reports missing translations; never copy a source name into every language solely to pass validation. Same spelling is valid for a proper name when linguistically appropriate.
5. Translate post titles, descriptions and bodies with the usual `author:translation` command. Keep category/tag references unchanged. Run `author:check` and `author:verify`, then commit the dictionary with the intended content changes.

Manual mode never invokes DeepL or rewrites the dictionary during deployment. Once a dictionary exists, missing taxonomy translations block manual validation/deployment. Legacy blogs without a dictionary retain their old literal-label behavior until `taxonomy:sync` is adopted. This avoids silently rewriting old published content during a template update.

## Search and preservation

The template indexes all group aliases with Pagefind and exposes them as additive `hub:taxonomy` RSS metadata, alongside ordinary localized RSS categories. GitBlog validates this metadata and maintains a per-post search index. Searching `bitcoin` or `비트코인` returns the same group’s posts within the selected language. Existing feeds without this metadata keep literal tag search.

IDs and aliases belong to each blog; one blog's dictionary never changes the meaning of another blog's tags. Alias changes take effect in GitBlog after the new feed is ingested. Old aliases are replaced on reingestion. To backfill an existing blog, generate/review its dictionary and deploy that blog; updating GitBlog alone cannot translate old feeds.

`content/taxonomy.json` is covered by the existing `content/` preservation policy. Template updates must preserve it byte-for-byte. README and personal instructions remain user-owned.
