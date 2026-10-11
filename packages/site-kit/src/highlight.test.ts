import { expect, test } from "vitest";
import { highlighter } from "./highlight.ts";
import { fence } from "./slidedeck-readme.ts";

const PAYLOAD = "<img src=x onerror=alert(1)><script>alert(2)</script>";
const HOSTILE = ["```", "````", PAYLOAD].join("\n");

// Shiki writes one <pre>, a <code> in it and a <span> per line and token: any
// other tag, or a second <pre>, is markup the code let out.
function expectOnePre(html: string) {
  expect(html.startsWith("<pre ")).toBe(true);
  expect(html.endsWith("</pre>")).toBe(true);
  expect(html.match(/<pre\b/g)).toHaveLength(1);
  expect(new Set(html.match(/<\/?[a-z]+/g)?.map((tag) => tag.replace("/", "")))).toEqual(new Set(["<pre", "<code", "<span"]));
}

// The escaped text, as a reader would see it.
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&#x3C;|&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x26;|&amp;/g, "&");

test("a skin's CSS is one highlighted <pre>, whatever lines of backticks or HTML it holds", async () => {
  const css = `.paper {\n  color: red;\n}\n${HOSTILE}\n.after { color: blue; }`;
  const highlight = await highlighter("css", "github-dark-default");
  const html = await highlight(css, "styles/skins/hostile.css");
  expectOnePre(html);
  expect(text(html)).toBe(css);
});

test("the README's quickstart is one highlighted <pre>, whatever lines of backticks or HTML it holds", async () => {
  const quickstart = `import * as Deck from '@slidedeck/react';\n${HOSTILE}\n<Deck.Root />`;
  const readme = ["# @slidedeck/react", "", "## Quickstart", "", "`````tsx", quickstart, "`````", "", "## Next", ""].join("\n");
  const code = fence(readme, "Quickstart");
  expect(code).toBe(quickstart);
  const highlight = await highlighter("tsx", "github-dark-default");
  const html = await highlight(code, "@slidedeck/react/README.md");
  expectOnePre(html);
  expect(text(html)).toBe(quickstart);
});
