/**
 * A docs page's HTML, laid out so a keyboard can scroll what is wider than the page: each
 * table in a region of the class `tableClass` that takes focus, named for the heading above
 * it, with a second table under one heading numbered so no two regions share a name; and each
 * block the highlighter leaves plain focusable, as a highlighted one is. For a site's `prose`.
 */
export function scrollableProse(html: string, { tableClass }: { readonly tableClass: string }): string {
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
    return `<div class="${tableClass}" role="region" tabindex="0" aria-label="${label}">${match}</div>`;
  });
  return tables.replaceAll("<pre>", '<pre tabindex="0">');
}
