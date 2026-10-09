import type { ReactNode } from "react";
import type { DocsLayoutProps } from "../../../src/index.ts";

/** The fixture's docs layout: the nav, then the page. */
export default function DocsPage({ title, description, href, nav, children }: DocsLayoutProps & { children?: ReactNode }) {
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <nav aria-label="Docs">
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
      <article>
        <h1>{title}</h1>
        {children}
      </article>
    </>
  );
}
