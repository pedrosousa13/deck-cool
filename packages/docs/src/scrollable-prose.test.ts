import { expect, test } from "vitest";
import { scrollableProse } from "./index.ts";

test("puts each table in a focusable region of the given class, named for the heading above it", () => {
  expect(scrollableProse('<h2 id="a">Results &amp; more</h2><table><tr><td>1</td></tr></table>', { tableClass: "cmp-table" })).toBe(
    '<h2 id="a">Results &amp; more</h2><div class="cmp-table" role="region" tabindex="0" aria-label="Results &amp; more"><table><tr><td>1</td></tr></table></div>',
  );
});

test("names a second table under one heading apart from the first, so no two regions share a name", () => {
  const html = scrollableProse("<table>a</table><table>b</table><h2>H</h2><table>c</table><table>d</table>", { tableClass: "t" });
  expect([...html.matchAll(/aria-label="([^"]*)"/g)].map(([, label]) => label)).toEqual(["Table", "Table 2", "H", "H 2"]);
});

test("names a region by its heading's text, without the heading's markup or a bare quote", () => {
  const html = scrollableProse('<h3>The <code>"budget"</code> key</h3><table></table>', { tableClass: "t" });
  expect(html).toContain('aria-label="The &quot;budget&quot; key"');
});

test("lets the keyboard scroll an unhighlighted block, as it does a highlighted one", () => {
  expect(scrollableProse("<pre><code>a\n</code></pre>", { tableClass: "t" })).toBe('<pre tabindex="0"><code>a\n</code></pre>');
  expect(scrollableProse('<pre class="shiki" tabindex="0"><code>a</code></pre>', { tableClass: "t" })).toBe(
    '<pre class="shiki" tabindex="0"><code>a</code></pre>',
  );
});
