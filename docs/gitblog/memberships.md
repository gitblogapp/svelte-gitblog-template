# Membership posts

Write membership posts in GitBlog Studio after enabling a blog membership under Settings → Membership. Memberships are independent of GitBlog account plans.

The GitBlog CMS stores the full body privately on the platform. Only an immutable post ID, title, cover, an explicitly approved preview, and membership embed metadata enter this public repository. Never put a private body, private image, token or full narration file in Git. Draft Git commits are public too. Converting an old public article cannot remove its Git history; create a new membership article instead.

Studio's “Allow public preview and GitBlog collection” switch controls whether the preview can appear in blog lists, Shorts, search and preview speech. With it off, the public page contains a title and membership prompt only. Disabling a membership never makes its body public.

`src/lib/template/ArticleBody.svelte` mounts the official `MembershipEmbed` component. The embed validates the registered blog origin and obtains a short-lived reader credential inside its own origin. No membership session or GitHub credential is shared with the parent blog. Safari users can authenticate in the dedicated login popup if third-party cookies are unavailable.

The reader is deployed independently as `gitblog-membership`. Its stable public URL remains `https://gitblog.app/membership/embed/{id}`; GitBlog forwards validated public metadata through a Cloudflare Service Binding. Login, membership authorization, private content and future billing remain in GitBlog. No additional secret or deployment setting is required in a blog repository.

The adapter passes the article language and current blog theme. Theme changes update the existing iframe through a checked message without interrupting the reader session. A new article or language remounts the iframe to prevent stale article content. Existing v1 adapters without language/theme parameters remain compatible. Other frameworks can implement the same `gitblog-membership-v1` iframe/message contract; the service does not depend on Svelte.

The reader uses a transparent canvas and follows the article's reading width, text colors, font families, font size and line height. Theme/viewport changes synchronize without reloading the iframe. The template sends only allowlisted presentation values, never CSS or font URLs; webfonts unavailable inside the iframe use the family's system fallback. Existing adapters keep a neutral light/dark design without these optional values.

Do not remove the embed when customizing the article theme. The iframe sends a checked resize message; it contains no private body or credential. Membership posts do not generate repository-hosted full TTS. The platform may narrate an approved preview. Translation workflows only see public stubs; the private full body is served in its authored language.

Current enrollment is free and does not charge or auto-convert to paid subscriptions. Payment-provider integration will be added separately.
