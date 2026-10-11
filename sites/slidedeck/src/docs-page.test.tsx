// @vitest-environment happy-dom
import type { NavGroup } from "@deck-cool/docs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import DocsPage from "../components/docs-page.tsx";

// The docs layout #51 renders slidedeck's docs package into, given what
// @deck-cool/docs hands a layout.

const nav: NavGroup[] = [
  {
    label: "Getting started",
    pages: [
      { title: "Overview", href: "/docs/" },
      { title: "Install", href: "/docs/install/" },
    ],
  },
  { label: "Guides", pages: [{ title: "Layout", href: "/docs/guides/layout/" }] },
];

function render(href: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = renderToStaticMarkup(
    <DocsPage title="Install" description="How to install slidedeck." href={href} nav={nav}>
      <p>The page's prose.</p>
    </DocsPage>,
  );
  return template.content;
}

const links = (scope: Element | null | undefined) =>
  [...(scope?.querySelectorAll("a") ?? [])].map((a) => [a.textContent, a.getAttribute("href")]);

describe("the docs layout", () => {
  // build.head titles and describes the page, from src/seo.ts, with its share card.
  test("leaves the page's title and description to build.head", () => {
    const page = render("/docs/install/");
    expect(page.querySelector("title")).toBeNull();
    expect(page.querySelector('meta[name="description"]')).toBeNull();
  });

  test("the sidebar lists nav.json's groups and pages in order, and marks the current page", () => {
    const sidebar = render("/docs/install/").querySelector('nav[aria-label="Documentation"]');
    expect([...(sidebar?.querySelectorAll("h2") ?? [])].map((h2) => h2.textContent)).toEqual(["Getting started", "Guides"]);
    expect(links(sidebar)).toEqual([
      ["Overview", "/docs/"],
      ["Install", "/docs/install/"],
      ["Layout", "/docs/guides/layout/"],
    ]);
    const current = [...(sidebar?.querySelectorAll('[aria-current="page"]') ?? [])];
    expect(current.map((a) => a.getAttribute("href"))).toEqual(["/docs/install/"]);
  });

  test("the article holds the title as its heading, then the page's prose and demos", () => {
    const article = render("/docs/install/").querySelector("article");
    expect(article?.querySelector("h1")?.textContent).toBe("Install");
    expect(article?.querySelector(".docs-prose p")?.textContent).toBe("The page's prose.");
  });

  test("the pager links the previous and next pages in nav order, across groups", () => {
    const pager = (href: string) => links(render(href).querySelector('nav[aria-label="Previous and next"]'));
    expect(pager("/docs/")).toEqual([["Next Install", "/docs/install/"]]);
    expect(pager("/docs/install/")).toEqual([
      ["Previous Overview", "/docs/"],
      ["Next Layout", "/docs/guides/layout/"],
    ]);
    expect(pager("/docs/guides/layout/")).toEqual([["Previous Install", "/docs/install/"]]);
  });

  test("search skips the sidebar and the pager, the same on every page", () => {
    const page = render("/docs/install/");
    for (const nav of page.querySelectorAll("nav")) expect(nav.getAttribute("data-fw-search")).toBe("ignore");
    expect(page.querySelector("article h1")?.closest("[data-fw-search]")).toBeNull();
  });
});
