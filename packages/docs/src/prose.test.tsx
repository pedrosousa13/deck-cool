import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import DocsProse from "./prose.tsx";

const render = (html: string) => renderToStaticMarkup(<DocsProse html={html} />);

test("renders the markdown's HTML as it is", () => {
  expect(render('<p>See <a href="/docs/install/">Install</a>.</p>\n')).toBe('<div><p>See <a href="/docs/install/">Install</a>.</p>\n</div>');
});

test("refuses HTML that markdown does not write, naming it", () => {
  expect(() => render("<p>a</p><script>alert(1)</script>")).toThrow(/<script>/);
  expect(() => render("<img src=x onerror=alert(1)>")).toThrow(/onerror=alert\(1\)/);
  expect(() => render('<a href="javascript:alert(1)">go</a>')).toThrow(/javascript:alert\(1\)/);
});
