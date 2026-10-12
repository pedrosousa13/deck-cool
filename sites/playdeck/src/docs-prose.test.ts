import { expect, test } from "vitest";
import { docsProse } from "./docs-prose.ts";

test("puts each table in a focusable region named for the heading above it", () => {
  expect(docsProse('<h2 id="a">Hosts</h2>\n<table><tr><td>1</td></tr></table>', { comparison: false })).toBe(
    '<h2 id="a">Hosts</h2>\n<div class="cmp-table" role="region" tabindex="0" aria-label="Hosts"><table><tr><td>1</td></tr></table></div>',
  );
});

test("lets the keyboard scroll an unhighlighted block, as it does a highlighted one", () => {
  expect(docsProse("<pre><code>a\n</code></pre>", { comparison: false })).toBe('<pre tabindex="0"><code>a\n</code></pre>');
});

test("writes out the comparison guide's footnotes and icons, and no other page's", () => {
  const html = "<table><tr><th>Axis</th></tr><tr><td>yes[^1]</td></tr></table>\n<p>[^1]: A note.</p>\n";
  expect(docsProse(html, { comparison: true })).toContain('<span class="cmp-status" data-status="yes">');
  expect(docsProse(html, { comparison: true })).toContain('<section class="cmp-footnotes"');
  expect(docsProse(html, { comparison: false })).toContain("yes[^1]");
});

// The markup it adds is the site's own, so the docs' HTML is checked first, as DocsProse checks it.
test("refuses HTML that markdown does not write, before it adds any", () => {
  expect(() => docsProse("<p>a</p><script>alert(1)</script>", { comparison: false })).toThrow(/<script>/);
  expect(() => docsProse('<img src=x onerror="alert(1)">', { comparison: true })).toThrow(/onerror/);
});
