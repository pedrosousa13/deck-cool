import type { ReactNode } from "react";
import type { DocsLayoutProps } from "@deck-cool/docs";
import DocsNav, { UNINDEXED } from "./docs-nav.tsx";
import { PAGE } from "./shell.ts";

/** The pages before and after `href` in the nav's order. */
function neighbours(nav: DocsLayoutProps["nav"], href: string) {
  const pages = nav.flatMap((group) => group.pages);
  const at = pages.findIndex((page) => page.href === href);
  return at === -1 ? {} : { previous: pages[at - 1], next: pages[at + 1] };
}

/**
 * The layout every docs page renders into: @deck-cool/docs hands it the page's
 * title, description, address and the whole nav, and the page's body as its
 * children. pagedeck.config.ts names it as defineDocs' layout.
 */
export default function DocsPage({ title, description, href, nav, children }: DocsLayoutProps & { children?: ReactNode }) {
  const { previous, next } = neighbours(nav, href);
  return (
    <div className={`${PAGE} fw-docs`}>
      <title>{title}</title>
      <meta name="description" content={description} />
      <DocsNav nav={nav} href={href} />
      <article className="fw-doc">
        <h1>{title}</h1>
        <div className="fw-prose">{children}</div>
        {(previous !== undefined || next !== undefined) && (
          <nav className="fw-pager" aria-label="Previous and next" {...UNINDEXED}>
            {previous !== undefined && (
              <a className="fw-pager__link" href={previous.href} rel="prev">
                <span className="fw-pager__dir">Previous</span>
                <span className="fw-pager__title">{previous.title}</span>
              </a>
            )}
            {next !== undefined && (
              <a className="fw-pager__link" href={next.href} rel="next">
                <span className="fw-pager__dir">Next</span>
                <span className="fw-pager__title">{next.title}</span>
              </a>
            )}
          </nav>
        )}
      </article>
    </div>
  );
}
