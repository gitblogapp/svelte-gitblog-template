import { bodyExcerptXml } from '@gitblogapp/core/body-excerpt';
import { publicArticleSeo } from '@gitblogapp/core/seo';

/**
 * Optional, public author context shares the existing 2 MiB RSS budget.
 * Never truncate JSON or export membership SEO, even if passed by mistake.
 * @param {{bodyExcerpt: string, access: string, previewAllowed: boolean, seo?: import('@gitblogapp/core/seo').ArticleSeo}} post
 * @param {number} byteBudget
 */
export function previewContentXml(post, byteBudget = 0) {
  if (!post.previewAllowed || byteBudget <= 0) return '';
  const body = bodyExcerptXml(post.bodyExcerpt, byteBudget);
  const seo = publicArticleSeo(post.seo, post.access);
  if (!seo) return body;
  const escaped = JSON.stringify(seo).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const context = `<hub:seo>${escaped}</hub:seo>`;
  return new TextEncoder().encode(body + context).byteLength <= byteBudget ? body + context : body;
}
