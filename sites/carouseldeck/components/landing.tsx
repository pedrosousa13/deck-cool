// The home page at /: GLOSSARY.md's "The landing pages' message", in the layout
// of deck.cool's home page. A server component: it ships no JavaScript of its
// own. Its one deck is an island, rendered once per skin.
import { umbrella } from "@deck-cool/brand/decks";
import { SkinSheet } from "@deck-cool/brand/skin-sheet";
import SkinDeck from "./skin-deck.tsx";
import { slidedeck } from "./slidedeck.ts";
import { install, quickstart, size, version } from "../src/facts.ts";
import { skins } from "../src/skins.ts";

/** Each claim holds for @slidedeck/react's README and its docs' "Layout is CSS" and "Drag". */
const points = [
  {
    heading: "A real scroll container",
    body: "Every deck is a scroll container with CSS scroll snap: touch, trackpad, wheel and keyboard move it natively, and slidedeck adds mouse drag.",
  },
  {
    heading: "slidedeck keeps count",
    body: "It tracks where the deck comes to rest, and Prev, Next and the dots ask the browser to scroll there.",
  },
  { heading: "Works with no CSS", body: "The quickstart is a working deck before you write a single rule." },
] as const;

/** The package's exports map gives fade and curve their own entry points; its docs' "Server rendering" the rest. */
const browser = [
  {
    heading: "Native scroll snap",
    body: "Momentum, snapping and focus scrolling are the browser's own. slidedeck tracks where the deck rests and asks the browser to move.",
  },
  {
    heading: "Effects you import",
    body: "Fade and curve each have an entry point of their own. A deck that imports neither ships none of their code.",
  },
  {
    heading: "Rendered on the server",
    body: "Slides, Prev and Next are in the HTML before any script runs, and React Server Components render the deck straight from a server file.",
  },
] as const;

/** The warnings are Deck.Root's development checks, which production bundles drop. */
const agents = [
  {
    heading: "A few named parts",
    body: "A deck is Deck.Root, Deck.Viewport and Deck.Slide, plus the controls you pick. The quickstart below is the whole of one.",
  },
  {
    heading: "Typed all the way",
    body: "slidedeck is written in TypeScript and ships its types, so your editor and your agent see every prop.",
  },
  {
    heading: "Mistakes explain themselves",
    body: "Pass index and defaultIndex together, or index without onIndexChange, and in development slidedeck says what to pass instead.",
  },
] as const;

/**
 * Only claims a test in pedrosousa13/slidedeck proves: slidedeck's rows of the
 * PR for #45 (deck-cool#46), word for word, each with a heading.
 */
const accessible = [
  { heading: "Named for screen readers", body: 'A labelled carousel region, each slide a group labelled "n of m".' },
  {
    heading: "Ready for the keyboard",
    body: "Arrow keys move the focused deck, and every dot is a button the keyboard reaches.",
  },
  { heading: "Focus brings it into view", body: "Tab into an off-screen slide and it scrolls into view." },
  { heading: "Announced politely", body: "A polite live region announces your moves, never autoplay's." },
  {
    heading: "Calm under reduced motion",
    body: "Under reduced motion, moves jump instead of gliding, and autoplay starts stopped.",
  },
] as const;

function Tiles({ tiles }: { tiles: readonly { readonly heading: string; readonly body: string }[] }) {
  return (
    <ul className="home-tiles">
      {tiles.map(({ heading, body }) => (
        <li key={heading} className="home-tile">
          <h3>{heading}</h3>
          <p className="home-tile__body">{body}</p>
        </li>
      ))}
    </ul>
  );
}

export default function Landing() {
  return (
    <>
      <section className="home-intro">
        <img src={slidedeck.icons.animated} alt="" width="96" height="96" />
        <p className="home-intro__lead">slidedeck {version}</p>
        <h1>
          A carousel that lets <br />
          <span>the browser do the scrolling.</span>
        </h1>
        <p>
          Compose it from a few React components, style every part with your own CSS, or hand it to your agent. The
          momentum, the snapping and the focus scrolling are the browser's own.
        </p>
        <div className="home-intro__actions">
          {/* No Copy button, which would be one more island: one click selects the command. */}
          <div className="home-install">
            <code>{install}</code>
          </div>
          <a className="home-button" href="/docs/">
            Read the docs
          </a>
          <a className="home-more" href="/examples/">
            See it in action ›
          </a>
        </div>
      </section>

      <section className="home-proof" aria-labelledby="proof">
        <div className="home-proof__text">
          <h2 id="proof">The browser scrolls. slidedeck keeps count.</h2>
          <ul className="home-proof__points">
            {points.map(({ heading, body }) => (
              <li key={heading}>
                <h3>{heading}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="home-proof__figure">
          <p>{size}</p>
          <p>{slidedeck.figure.label}</p>
          <p>{slidedeck.figure.note}</p>
          <p>
            Measured by <code>pnpm compare</code> in slidedeck's repo, and its CI fails when the number goes stale.
          </p>
          <a className="home-more" href="/docs/compare/">
            How it is measured ›
          </a>
        </div>
      </section>

      <section className="home-band" aria-labelledby="unstyled">
        <div className="home-band__text">
          <h2 id="unstyled">Unstyled, your look.</h2>
          <p>
            slidedeck needs no stylesheet. Its defaults and its optional theme sit in <code>:where()</code>, so any rule
            of yours wins. Every part carries a name, like <code>data-slidedeck-next</code> or{" "}
            <code>data-slidedeck-dots</code>, for your CSS or your tokens to reach. Here is one live deck, shown twice:
            the markup is the same, and only the CSS changes.
          </p>
        </div>
        <div className="home-skins">
          {skins().map((skin) => (
            <figure key={skin.name} className="home-skin">
              <figcaption>{skin.name}</figcaption>
              <div className={`home-skin__stage ${skin.className}`}>
                <SkinDeck label={`${skin.name} deck`} />
              </div>
              <SkinSheet name={skin.name} css={skin.css} html={skin.html} />
            </figure>
          ))}
        </div>
        <div className="home-skins__more">
          <a className="home-button" href="/examples/">
            See all examples ›
          </a>
        </div>
      </section>

      <section className="home-band" aria-labelledby="small">
        <div className="home-band__text">
          <h2 id="small">Small, leans on the browser.</h2>
          <p>
            The browser already knows how to scroll. slidedeck builds on that instead of rebuilding it, so a carousel
            with Prev and Next is {size}, min+gzip, with React external.
          </p>
        </div>
        <Tiles tiles={browser} />
      </section>

      <section className="home-band" aria-labelledby="agents">
        <div className="home-band__text">
          <h2 id="agents">Built for agents.</h2>
          <p>Whether you write the code or your coding agent does, slidedeck leaves less to guess.</p>
        </div>
        <Tiles tiles={agents} />
        <div className="home-code" dangerouslySetInnerHTML={{ __html: quickstart }} />
      </section>

      <section className="home-band" aria-labelledby="accessible">
        <div className="home-band__text">
          <h2 id="accessible">Accessible by default.</h2>
          <p>
            slidedeck takes care of the keyboard, focus and screen readers for you. Each line below is backed by a test
            in slidedeck's own repo.
          </p>
          <a className="home-more" href="/examples/">
            Try the examples ›
          </a>
        </div>
        <Tiles tiles={accessible} />
      </section>

      <section className="home-family">
        <p>
          slidedeck is part of deck.cool, a family of unstyled React packages that look like you and work like the
          browser.{" "}
          <a className="home-more" href={umbrella.url}>
            Meet the family ›
          </a>
        </p>
      </section>
    </>
  );
}
