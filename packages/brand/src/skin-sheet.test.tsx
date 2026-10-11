import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { SkinSheet } from "./skin-sheet.tsx";

const pre = '<pre class="shiki" tabindex="0"><code><span class="line">.a { color: red; }</span></code></pre>';
const render = (html: string) => renderToStaticMarkup(<SkinSheet name="Paper" css=".a { color: red; }" html={html} />);

test("renders a highlighted sheet that is one <pre>, named for the skin", () => {
  expect(render(pre)).toContain('<pre aria-label="Paper CSS" class="shiki"');
});

test("refuses a highlighted sheet that does not start with <pre or end with </pre>", () => {
  expect(() => render(`<img src=x>${pre}`)).toThrow(/Paper CSS.*one <pre>/);
  expect(() => render(`${pre}<img src=x onerror=alert(1)>`)).toThrow(/Paper CSS.*one <pre>/);
});
