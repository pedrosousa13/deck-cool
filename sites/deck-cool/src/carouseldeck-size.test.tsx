import { Window, type Document } from "happy-dom";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { text } from "@deck-cool/site-kit/build-test";
import Layout from "../components/layout.tsx";
import Landing from "../../carouseldeck/components/landing.tsx";

// Renders both pages in Node, where each reads @carouseldeck/react's README when
// the site builds. One fixture README stands in for the release's in both,
// with a size no release has, so a page that retyped the size would fail.
vi.mock("@deck-cool/site-kit/carouseldeck-readme", async (original) => {
  const { fixtureReadme } = await import("@deck-cool/site-kit/carouseldeck-readme.fixture");
  return {
    ...(await original<typeof import("@deck-cool/site-kit/carouseldeck-readme")>()),
    readCarouseldeckRelease: () => ({ readme: fixtureReadme("12.34 KB"), version: "12.34.56" }),
  };
});

function render(page: ReactElement): Document {
  const { document } = new Window();
  document.body.innerHTML = renderToStaticMarkup(page);
  return document;
}

test("deck.cool's carouseldeck card and carouseldeck's home page show the size the README gives", () => {
  const card = render(<Layout title="deck.cool" />);
  expect(text(card.querySelector("#carouseldeck .card__figure > p"))).toBe("12.34 KB");

  const home = render(<Landing />);
  expect(text(home.querySelector(".home-proof__figure > p"))).toBe("12.34 KB");
  expect(text(home.getElementById("small")?.parentElement?.querySelector("p"))).toContain(
    "a carousel with Prev and Next is 12.34 KB, min+gzip",
  );
});
