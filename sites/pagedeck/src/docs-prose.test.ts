import { expect, test } from "vitest";
import { docsProse } from "./docs-prose.ts";

test("puts each table in a focusable region named for the heading above it", () => {
  expect(docsProse('<h2 id="a">Exit codes</h2>\n<table><tr><td>1</td></tr></table>')).toBe(
    '<h2 id="a">Exit codes</h2>\n<div class="fw-table" role="region" tabindex="0" aria-label="Exit codes"><table><tr><td>1</td></tr></table></div>',
  );
});

test("numbers a heading's second table, and strips the heading's markup from the name", () => {
  const html = docsProse("<h3>The <code>budget</code> key</h3><table></table><table></table>");
  expect([...html.matchAll(/aria-label="([^"]*)"/g)].map(([, label]) => label)).toEqual(["The budget key", "The budget key 2"]);
});

test("lets the keyboard scroll an unhighlighted block, as it does a highlighted one", () => {
  expect(docsProse("<pre><code>a\n</code></pre>")).toBe('<pre tabindex="0"><code>a\n</code></pre>');
});
