export interface SkinSheetProps {
  /** The skin's name, such as "Paper". */
  readonly name: string;
  /** The stylesheet's source, as the build compiles it. */
  readonly css: string;
  /** The same source highlighted at build time: one `<pre>`, as Shiki writes it. */
  readonly html: string;
}

/**
 * A skin's stylesheet, folded until a reader opens it: a native `<details>`
 * whose `<summary>` names the skin and counts its lines. Styled by
 * `styles/skin-sheet.css`, which a site lists in its `build.css`, so it ships
 * no JavaScript. The search index skips it: a stylesheet answers no search.
 */
export function SkinSheet({ name, css, html }: SkinSheetProps) {
  const label = `${name} CSS`;
  if (!html.startsWith("<pre ") || !html.endsWith("</pre>")) throw new Error(`${label}: the highlighted sheet is not one <pre>`);
  return (
    <details className="skin-sheet" data-fw-search="ignore">
      <summary>{`${label} · ${css.split("\n").length} lines`}</summary>
      {/* The <pre> is focusable, so it scrolls from the keyboard, and so it is named. */}
      <div dangerouslySetInnerHTML={{ __html: html.replace("<pre ", `<pre aria-label="${label}" `) }} />
    </details>
  );
}
