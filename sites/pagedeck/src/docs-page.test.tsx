import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { DocsLayoutProps } from "@deck-cool/docs";
import DocsPage from "../components/docs-page.tsx";

// The layout every docs page renders into, through @deck-cool/docs, rendered
// here with a nav in nav.json's shape.

const NAV: DocsLayoutProps["nav"] = [
  { label: "Overview", pages: [{ title: "Pagedeck", href: "/docs/" }] },
  {
    label: "How-to guides",
    pages: [
      { title: "Add an island", href: "/docs/how-to/add-an-island/" },
      { title: "Connect a CMS", href: "/docs/how-to/connect-a-cms/" },
    ],
  },
];

function render(href: string) {
  const html = renderToStaticMarkup(
    <DocsPage title="Add an island" description="How a page gets one interactive component." href={href} nav={NAV}>
      <p>The page's prose.</p>
    </DocsPage>,
  );
  return new new Window().DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
}

test("lists the groups and pages in nav.json's order, marking the current page", () => {
  const doc = render("/docs/how-to/add-an-island/");
  const nav = doc.querySelector('nav[aria-label="Documentation"]');
  expect([...(nav?.querySelectorAll("h2") ?? [])].map((h2) => h2.textContent)).toEqual(["Overview", "How-to guides"]);
  expect([...(nav?.querySelectorAll("a") ?? [])].map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("aria-current")])).toEqual([
    ["Pagedeck", "/docs/", null],
    ["Add an island", "/docs/how-to/add-an-island/", "page"],
    ["Connect a CMS", "/docs/how-to/connect-a-cms/", null],
  ]);
});

test("heads the page with its title, then its body", () => {
  const doc = render("/docs/how-to/add-an-island/");
  expect(doc.querySelector("title")?.textContent).toBe("Add an island");
  expect(doc.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("How a page gets one interactive component.");
  const article = doc.querySelector("article");
  expect(article?.querySelector("h1")?.textContent).toBe("Add an island");
  expect(article?.querySelector(".fw-prose p")?.textContent).toBe("The page's prose.");
});

test("links the pages before and after it in nav.json's order", () => {
  const pager = (href: string) =>
    [...render(href).querySelectorAll('nav[aria-label="Previous and next"] a')].map((a) => [a.getAttribute("rel"), a.getAttribute("href")]);
  expect(pager("/docs/how-to/add-an-island/")).toEqual([
    ["prev", "/docs/"],
    ["next", "/docs/how-to/connect-a-cms/"],
  ]);
  expect(pager("/docs/")).toEqual([["next", "/docs/how-to/add-an-island/"]]);
  expect(pager("/docs/how-to/connect-a-cms/")).toEqual([["prev", "/docs/how-to/add-an-island/"]]);
});
