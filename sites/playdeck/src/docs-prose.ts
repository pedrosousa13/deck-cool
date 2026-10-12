import { footnotes, iconizeFeaturesTable, scrollTables } from "./comparison.ts";

/**
 * A stretch of a docs page's HTML, with what this site adds to it: each table
 * in a region that scrolls, an unhighlighted block that the keyboard can
 * scroll as it can a highlighted one, and, on the comparison guide, its
 * footnotes and icons. defineDocs runs it as its `prose`, after it checks
 * the docs' HTML, so the markup it adds is the site's own.
 */
export function docsProse(html: string, { comparison }: { comparison: boolean }): string {
  const prose = comparison ? iconizeFeaturesTable(footnotes(html, "comparison")) : html;
  return scrollTables(prose).replaceAll("<pre>", '<pre tabindex="0">');
}
