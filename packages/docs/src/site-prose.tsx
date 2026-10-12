/**
 * A stretch of a docs page's HTML after the site's `prose` rewrite. Not an island: it ships no
 * JavaScript. defineDocs checks the docs' HTML before the rewrite, so what this renders unchecked
 * is that HTML and the site's own markup.
 */
export default function DocsSiteProse({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
