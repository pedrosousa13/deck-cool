import { unsafeMarkup } from "./page.ts";

/**
 * A stretch of a docs page's rendered markdown. Not an island: it ships no JavaScript. The
 * docs come from npm, so HTML markdown does not write is refused here, where it is inserted,
 * as well as in the loader's scan of the markdown.
 */
export default function DocsProse({ html }: { html: string }) {
  const unsafe = unsafeMarkup(html);
  if (unsafe !== undefined) throw new Error(`Docs prose: holds ${unsafe}, which markdown does not write — the docs page cannot hold raw HTML`);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
