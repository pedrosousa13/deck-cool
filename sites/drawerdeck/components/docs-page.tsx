import type { DocsLayoutProps } from "@deck-cool/docs";
import type { ReactNode } from "react";

/** What is the same on every page, so search finds a page by its own words only. */
const UNINDEXED = { "data-fw-search": "ignore" } as const;

/**
 * A docs page, for `defineDocs({ layout: "docsPage" })`: the sidebar from
 * nav.json, then the page, its prose and demos as children, then the
 * previous and next pages in nav order. It ships no JavaScript; only the
 * demos among its children are islands. build.head gives the page its title
 * and description, from src/seo.ts.
 */
export default function DocsPage({ title, href, nav, children }: DocsLayoutProps & { children?: ReactNode }) {
  const order = nav.flatMap((group) => group.pages);
  const at = order.findIndex((page) => page.href === href);
  const previous = at > 0 ? order[at - 1] : undefined;
  const next = at >= 0 ? order[at + 1] : undefined;
  return (
    <div className="docs">
      <nav className="docs-sidebar" aria-label="Documentation" {...UNINDEXED}>
        {nav.map((group) => (
          <section key={group.label}>
            <h2>{group.label}</h2>
            <ul>
              {group.pages.map((page) => (
                <li key={page.href}>
                  <a href={page.href} aria-current={page.href === href ? "page" : undefined}>
                    {page.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
      <article className="docs-article">
        <h1>{title}</h1>
        <div className="docs-prose">{children}</div>
        {(previous !== undefined || next !== undefined) && (
          <nav className="docs-pager" aria-label="Previous and next" {...UNINDEXED}>
            {previous !== undefined && (
              <a href={previous.href} rel="prev">
                <span>Previous</span> {previous.title}
              </a>
            )}
            {next !== undefined && (
              <a href={next.href} rel="next">
                <span>Next</span> {next.title}
              </a>
            )}
          </nav>
        )}
      </article>
    </div>
  );
}
