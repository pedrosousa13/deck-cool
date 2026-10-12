import { expect, test } from "vitest";
import { footnotes, iconizeFeaturesTable } from "./comparison.ts";

test("writes footnotes out: numbered references, and the notes as a list in place of the first, each with a way back", () => {
  const html = footnotes(
    "<table><tr><td>a</td><td>b[^x]</td></tr></table>\n<p>Text[^y], again[^x].</p>\n<p>[^x]: <strong>X</strong> note.</p>\n<p>[^y]: Y note\ngoes on.</p>\n<p>After.</p>\n",
    "doc",
  );
  expect(html).toContain('<td>b<sup><a href="#doc-fn-1" id="doc-fnref-1">1</a></sup></td>');
  expect(html).toContain('<p>Text<sup><a href="#doc-fn-2" id="doc-fnref-2">2</a></sup>, again<sup><a href="#doc-fn-1">1</a></sup>.</p>');
  expect(html).toContain(
    '<section class="cmp-footnotes" aria-label="Footnotes"><ol>' +
      '<li id="doc-fn-1"><strong>X</strong> note. <a href="#doc-fnref-1" aria-label="Back to reference 1">↩</a></li>' +
      '<li id="doc-fn-2">Y note\ngoes on. <a href="#doc-fnref-2" aria-label="Back to reference 2">↩</a></li>' +
      "</ol></section>\n<p>After.</p>",
  );
  expect(html).not.toContain("[^");
});

test("refuses a reference with no note, and a note with no reference", () => {
  expect(() => footnotes("<p>a[^1]</p>", "doc")).toThrow("[^1] has no note");
  expect(() => footnotes("<p>a[^1]</p><p>[^1]: one</p><p>[^2]: two</p>", "doc")).toThrow("no reference names the footnotes 2");
  expect(() => footnotes("<p>a[^1]</p><p>[^1]: one</p><p>[^1]: again</p>", "doc")).toThrow("[^1] is defined twice");
});

test("reads no note, and rewrites no reference, inside a code block", () => {
  const html = footnotes("<p>a[^1]</p>\n<pre><code>[^2]: not a note\nb[^2]\n</code></pre>\n<p>[^1]: one</p>", "doc");
  expect(html).toContain("<pre><code>[^2]: not a note\nb[^2]\n</code></pre>");
  expect(html).toContain('<li id="doc-fn-1">one');
});

test("leaves HTML with no footnotes as it is", () => {
  expect(footnotes("<p>Plain.</p>", "doc")).toBe("<p>Plain.</p>");
});

test("draws an icon beside each status word in the features table alone", () => {
  const features = "<table><thead><tr><th>Axis</th></tr></thead><tbody><tr><td>HLS</td><td>yes<sup><a>1</a></sup></td><td>n/a</td></tr></tbody></table>";
  const results = "<table><thead><tr><th>Library</th></tr></thead><tbody><tr><td>yes</td></tr></tbody></table>";
  const out = iconizeFeaturesTable(features + results);
  expect(out).toContain('<table class="cmp-features">');
  expect(out).toContain('<td><span class="cmp-status" data-status="yes"><svg');
  expect(out).toContain('<span class="cmp-status__word">yes</span></span><sup><a>1</a></sup></td>');
  expect(out).toContain('data-status="n/a"');
  expect(out).toContain(results);
});
