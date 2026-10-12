/**
 * A stretch of a docs page's HTML, with what this site adds to it: each table
 * in a region that scrolls, named for the heading above it, and an
 * unhighlighted block that the keyboard can scroll as it can a highlighted
 * one. defineDocs runs it as its `prose`, after it checks the docs' HTML, so
 * the markup it adds is the site's own.
 */
export function docsProse(html: string): string {
  let heading = "Table";
  let count = 0;
  const tables = html.replace(/<h([2-4])[^>]*>([\s\S]*?)<\/h\1>|<table[\s\S]*?<\/table>/g, (match, _level, text?: string) => {
    if (text !== undefined) {
      heading = text.replace(/<[^>]*>/g, "").trim();
      count = 0;
      return match;
    }
    count += 1;
    // The heading's text is HTML already, so it needs no escaping but its quotes.
    const label = `${heading.replace(/"/g, "&quot;")}${count > 1 ? ` ${String(count)}` : ""}`;
    return `<div class="fw-table" role="region" tabindex="0" aria-label="${label}">${match}</div>`;
  });
  return tables.replaceAll("<pre>", '<pre tabindex="0">');
}
