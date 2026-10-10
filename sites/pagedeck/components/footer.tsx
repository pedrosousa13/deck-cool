import { DOCS_ORIGIN, PATHS, REPO } from "./links.ts";

const LINKS = [
  ["Home", PATHS.home],
  ["Docs", `${DOCS_ORIGIN}/`],
  ["Features", PATHS.features],
  ["Island demo", PATHS.interactive],
  ["Server data", PATHS.content],
  ["GitHub", REPO],
] as const;

/** Rendered by build.chrome after <main>, so it is the page's contentinfo landmark. */
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <p>This site is built with Pagedeck, the framework it describes.</p>
        <nav aria-label="Footer">
          <ul>
            {LINKS.map(([label, href]) => (
              <li key={href}>
                <a href={href}>{label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
