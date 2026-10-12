/*
 * What this site adds to the library comparison guide, guides/comparison.md in
 * @playdeck/docs, a port of pedrosousa13/playdeck's
 * apps/site/src/comparison-icons.mjs at cf72813. Each step reads the guide's
 * rendered HTML. The docs loader has no footnotes, so `footnotes` writes the
 * features table's `[^n]` references and their notes out. The features table
 * draws an icon beside each status word (`iconizeFeaturesTable`). A wide table
 * scrolls in a labelled region of its own (`scrollTables`), so the page never
 * scrolls sideways.
 */

/** Each code block, kept out of the footnote passes: nothing in one is a note or a reference. */
const CODE = /(<pre[\s\S]*?<\/pre>)/;
const DEFINITION = /<p>\[\^([^\]\s]+)\]: ([\s\S]*?)<\/p>\n?/g;

/**
 * GFM footnotes, written out: each `[^label]` reference becomes a numbered
 * superscript link, and the notes, each a paragraph that opens `[^label]: `,
 * an ordered list where the first of them stood, each with a link back.
 * Numbered in the order of first reference, as GitHub numbers them, and each
 * id under `prefix`. Fails on a reference with no note, a note no reference
 * names, and a label defined twice.
 */
export function footnotes(html: string, prefix: string): string {
  const parts = html.split(CODE);
  const notes = new Map<string, string>();
  const marked = parts.map((part, at) =>
    at % 2 === 1
      ? part
      : part.replace(DEFINITION, (_, label: string, note: string) => {
          if (notes.has(label)) throw new Error(`comparison: the footnote [^${label}] is defined twice`);
          notes.set(label, note);
          return notes.size === 1 ? "\0notes\0" : "";
        }),
  );
  const order: string[] = [];
  const referenced = marked.map((part, at) =>
    at % 2 === 1
      ? part
      : part.replace(/\[\^([^\]\s]+)\]/g, (_, label: string) => {
          if (!notes.has(label)) throw new Error(`comparison: the footnote [^${label}] has no note`);
          const isFirst = !order.includes(label);
          if (isFirst) order.push(label);
          const number = order.indexOf(label) + 1;
          return `<sup><a href="#${prefix}-fn-${number}"${isFirst ? ` id="${prefix}-fnref-${number}"` : ""}>${number}</a></sup>`;
        }),
  );
  if (notes.size === 0) return referenced.join("");
  const unused = [...notes.keys()].filter((label) => !order.includes(label));
  if (unused.length > 0) throw new Error(`comparison: no reference names the footnotes ${unused.join(", ")}`);

  const list = order.map(
    (label, index) =>
      `<li id="${prefix}-fn-${index + 1}">${notes.get(label) ?? ""} <a href="#${prefix}-fnref-${index + 1}" aria-label="Back to reference ${index + 1}">↩</a></li>`,
  );
  return referenced.join("").replace("\0notes\0", `<section class="cmp-footnotes" aria-label="Footnotes"><ol>${list.join("")}</ol></section>\n`);
}

type Status = "yes" | "partial" | "plugin" | "no" | "n/a";

/**
 * One icon per status, beside the word and never instead of it, on one 16×16
 * box in `currentColor`. `partial` and `plugin` share a colour, so their shapes
 * are unrelated.
 */
const ICONS: Readonly<Record<Status, string>> = {
  yes: '<svg class="cmp-status__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8.5l3 3 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  partial:
    '<svg class="cmp-status__icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 2a6 6 0 000 12z" fill="currentColor"/></svg>',
  plugin:
    '<svg class="cmp-status__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5 1v4M11 1v4M4 5h8v2a4 4 0 01-4 4 4 4 0 01-4-4V5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 11v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  no: '<svg class="cmp-status__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  "n/a":
    '<svg class="cmp-status__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

const TABLE = /<table>[\s\S]*?<\/table>/g;
const STATUS_CELL = /<td>\s*(yes|partial|plugin|no|n\/a)\s*(<sup>[\s\S]*?<\/sup>)?\s*<\/td>/g;

/** The features table, the one whose header names `Axis`, with an icon beside each status word. Other tables pass through. */
export function iconizeFeaturesTable(html: string): string {
  return html.replace(TABLE, (table) =>
    !table.includes(">Axis<")
      ? table
      : table
          .replace("<table>", '<table class="cmp-features">')
          .replace(
            STATUS_CELL,
            (_, status: Status, footnote = "") =>
              `<td><span class="cmp-status" data-status="${status}">${ICONS[status]}<span class="cmp-status__word">${status}</span></span>${footnote}</td>`,
          ),
  );
}

/**
 * Each table inside a region that scrolls sideways, named for the heading
 * above it, and a second table under one heading numbered, so no two regions
 * share a name. The region takes focus, so a keyboard can scroll a table with
 * no link in it.
 */
export function scrollTables(html: string): string {
  let heading = "Table";
  let count = 0;
  return html.replace(/<h([2-4])[^>]*>([\s\S]*?)<\/h\1>|<table[\s\S]*?<\/table>/g, (match, _level, text?: string) => {
    if (text !== undefined) {
      heading = text.replace(/<[^>]*>/g, "").trim();
      count = 0;
      return match;
    }
    count += 1;
    // The heading's text is HTML already, so it needs no escaping but its quotes.
    const label = `${heading.replace(/"/g, "&quot;")}${count > 1 ? ` ${count}` : ""}`;
    return `<div class="cmp-table" role="region" tabindex="0" aria-label="${label}">${match}</div>`;
  });
}
