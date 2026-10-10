// The home page at /: CONTEXT.md's "The landing pages' message", in the layout
// of deck.cool's home page. A server component: it ships no JavaScript of its
// own. Its one player is an island, rendered once per skin.
import { playdeck, umbrella } from "@deck-cool/brand/decks";
import { SkinSheet } from "@deck-cool/brand/skin-sheet";
import { unescapedHtml } from "@pagedeck/core/tree";
import type { Skin } from "../src/skins.ts";
import { DOCS, PATHS } from "./links.ts";
import SkinPlayer from "./skin-player.tsx";

/** Each claim holds for playdeck's README at 1.3.0. */
const points = [
  {
    heading: "Every control is a component",
    body: "Reorder them, drop one, or put your own between them. Nothing renders that you did not compose.",
  },
  {
    heading: "It asks before it draws",
    body: "Each provider says what it can do. A control it cannot honour is left out, not shown and disabled.",
  },
  {
    heading: "One API, five sources",
    body: "Native video, HLS, YouTube, Vimeo and Wistia. The source picks the provider, and nothing else changes.",
  },
] as const;

/**
 * playdeck's README at 1.3.0: its "Packages" section, and its "What a page
 * actually downloads" table, which `pnpm test:budgets` measures on each CI
 * run. Re-read the figure at each bump.
 */
const browser = [
  {
    heading: "Providers on demand",
    body: "A page that plays MP4 ships no YouTube, Vimeo, Wistia or hls.js code. Each provider loads once a source asks for it.",
  },
  {
    heading: "Native HLS where it exists",
    body: "Safari and iOS play HLS on their own, so playdeck never fetches hls.js there.",
  },
  {
    heading: "40.4 KB for an MP4",
    body: "The core, the primitives and the native provider, gzipped, with React external. playdeck's CI measures it on every run.",
  },
] as const;

/**
 * The types are @playdeck/react's exports map; the errors are use-activation.ts's
 * configuration errors, which the player reports as its error state.
 */
const agents = [
  {
    heading: "A few named parts",
    body: "A player is Player.Root, Player.Viewport and Player.Media, plus the controls you pick. The quickstart below is the whole of one.",
  },
  {
    heading: "Typed all the way",
    body: "playdeck is written in TypeScript and ships its types, so your editor and your agent see every prop.",
  },
  {
    heading: "Mistakes say what they are",
    body: "Ask a player to autoplay while it waits for a press, or to load on sight with no Player.Viewport, and it reports an error that names the mistake.",
  },
] as const;

/**
 * Only claims a test in pedrosousa13/playdeck proves: playdeck's rows of the
 * PR for #45 (deck-cool#46), word for word, each with a heading.
 */
const accessible = [
  { heading: "Every control by Tab", body: "Every control is reachable by Tab, in order." },
  { heading: "Shortcuts reach the video", body: "Keyboard shortcuts mute, pause and seek the video itself." },
  { heading: "Focus comes back", body: "The settings menu takes focus when it opens and gives it back on Escape." },
  { heading: "Announced, never narrated", body: "Live regions announce changes of state, never the ticking clock." },
  { heading: "Clean under axe", body: "axe finds no violations in any state of the reference player." },
  { heading: "Calm under reduced motion", body: "A viewer who asks for reduced motion gets no autoplay, unless you opt out." },
] as const;

function Tiles({ tiles }: { tiles: readonly { readonly heading: string; readonly body: string }[] }) {
  return (
    <ul className="pd-tiles">
      {tiles.map(({ heading, body }) => (
        <li key={heading} className="pd-tile">
          <h3>{heading}</h3>
          <p className="pd-tile__body">{body}</p>
        </li>
      ))}
    </ul>
  );
}

export default function HomePage({
  version,
  skins,
  quickstart,
}: {
  version: string;
  skins: readonly Skin[];
  /** The README's quickstart, highlighted at build time. */
  quickstart: string;
}) {
  return (
    <>
      <section className="pd-intro">
        <img src={playdeck.icons.animated} alt="" width="96" height="96" />
        <p className="pd-intro__lead">playdeck {version}</p>
        <h1>
          A video player you compose, <br />
          <span>not one you configure.</span>
        </h1>
        <p>
          Compose it from React parts, style each one with your own CSS, or hand it to your agent.
        </p>
        <div className="pd-intro__actions">
          {/* No Copy button, which would be one more island: one click selects the command. */}
          <div className="pd-install">
            <code className="pd-install__command">{playdeck.install}</code>
          </div>
          <a className="pd-button" href={DOCS.start}>
            Read the docs
          </a>
        </div>
      </section>

      {/* The same player as the skins below, in the site's own look. */}
      <section className="pd-showcase">
        <SkinPlayer provider="youtube" stage="showcase" />
      </section>

      <section className="pd-proof" aria-labelledby="proof">
        <div className="pd-proof__text">
          <h2 id="proof">You pick the controls. playdeck knows what each source can do.</h2>
          <ul className="pd-proof__points">
            {points.map(({ heading, body }) => (
              <li key={heading}>
                <h3>{heading}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ul>
        </div>
        {/* The figure is CONTEXT.md's. This site's browser test checks a
            stronger claim: before a press, nothing on this page reaches
            another host. */}
        <div className="pd-proof__figure">
          <p>{playdeck.figure.value}</p>
          <p>{playdeck.figure.label}</p>
          <p>
            Measured on this page. Both players below wait for a press, and this site's tests fail if anything reaches
            another host before it.
          </p>
        </div>
      </section>

      <section className="pd-band" aria-labelledby="unstyled">
        <div className="pd-band__text">
          <h2 id="unstyled">Unstyled, your look.</h2>
          <p>
            playdeck imports no stylesheet. Its parts set only the geometry they need, and the optional theme is one
            import. Every part carries a name, like <code>data-playdeck-part="play-button"</code>, for your CSS or your
            tokens to reach. Here is one live player, shown twice: the markup is the same, and only the CSS and the source change.
          </p>
        </div>
        <div className="pd-skins">
          {skins.map((skin) => (
            <figure key={skin.name} className="pd-skin">
              <figcaption>
                {skin.name} · {skin.host}
              </figcaption>
              <div className={`pd-skin__stage ${skin.className}`}>
                <SkinPlayer provider={skin.provider} />
              </div>
              <SkinSheet name={skin.name} css={skin.css} html={skin.html} />
            </figure>
          ))}
        </div>
        <p className="pd-band__note">
          No player on this page reaches YouTube or Vimeo until you press play. All three play <em>Sprite Fright</em>, ©
          Blender Studio, licensed{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/" rel="license">
            CC BY 4.0
          </a>
          , from the studio's own uploads to YouTube and Vimeo.
        </p>
        <a className="pd-button" href={PATHS.examples}>
          See all examples ›
        </a>
      </section>

      <section className="pd-band" aria-labelledby="small">
        <div className="pd-band__text">
          <h2 id="small">Small, leans on the browser.</h2>
          <p>
            The browser already knows how to play a video. playdeck drives the video element instead of rebuilding it,
            and loads a provider only when a source needs one.
          </p>
        </div>
        <Tiles tiles={browser} />
      </section>

      <section className="pd-band" aria-labelledby="agents">
        <div className="pd-band__text">
          <h2 id="agents">Built for agents.</h2>
          <p>Whether you write the code or your coding agent does, playdeck leaves less to guess.</p>
        </div>
        <Tiles tiles={agents} />
        <div className="pd-code" {...unescapedHtml(quickstart)} />
      </section>

      <section className="pd-band" aria-labelledby="accessible">
        <div className="pd-band__text">
          <h2 id="accessible">Accessible by default.</h2>
          <p>
            playdeck takes care of the keyboard, focus and screen readers for you. Each line below is backed by a test
            in playdeck's own repo.
          </p>
        </div>
        <Tiles tiles={accessible} />
      </section>

      <section className="pd-family">
        <p>
          playdeck is part of deck.cool, a family of unstyled React packages that look like you and work like the
          browser.{" "}
          <a className="pd-more" href={umbrella.url}>
            Meet the family ›
          </a>
        </p>
      </section>
    </>
  );
}
