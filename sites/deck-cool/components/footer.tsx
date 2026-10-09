import { GITHUB, NPM } from "./links.ts";

/** Rendered by build.chrome after <main>, so it is the page's contentinfo landmark. */
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <span>deck.cool</span>
        <span>MIT licensed</span>
        <a href={GITHUB}>GitHub</a>
        <a href={NPM}>npm</a>
      </div>
    </footer>
  );
}
