import { unsafeMarkup } from "@deck-cool/docs";
import { footnotes, iconizeFeaturesTable, scrollTables } from "./comparison.ts";

/**
 * A stretch of a docs page's HTML, with what this site adds to it: each table
 * in a region that scrolls, an unhighlighted block that the keyboard can
 * scroll as it can a highlighted one, and, on the comparison guide, its
 * footnotes and icons. The markup it adds is the site's own, so it renders
 * through the site's prose and not DocsProse, and the docs' HTML is checked
 * first, as DocsProse checks it.
 */
export function docsProse(html: string, { comparison }: { comparison: boolean }): string {
  const unsafe = unsafeMarkup(html);
  if (unsafe !== undefined) throw new Error(`Docs prose: holds ${unsafe}, which markdown does not write: the docs page cannot hold raw HTML`);
  const prose = comparison ? iconizeFeaturesTable(footnotes(html, "comparison")) : html;
  return scrollTables(prose).replaceAll("<pre>", '<pre tabindex="0">');
}
