import { decks, umbrella } from "@deck-cool/brand/decks";
import { figureValue } from "../src/facts.ts";

interface Props {
  title: string;
}

/** One way each deck leans on the browser. */
const browser = [
  {
    deck: "carouseldeck",
    heading: "Native scrolling",
    body: "Momentum, snapping and keyboard scrolling come from CSS scroll snap in a real scroll container.",
  },
  { deck: "playdeck", heading: "Native video", body: "Files and HLS streams play in the browser's own video element." },
  {
    deck: "pagedeck",
    heading: "HTML first",
    body: "Pages render to HTML when the site builds. A page with nothing interactive ships no JavaScript at all.",
  },
] as const;

/** No claim about llms.txt or a markdown twin per page until pagedeck#34 ships them. */
const agents = [
  {
    heading: "Small typed APIs",
    body: "Every deck is written in TypeScript and ships its types, so your editor and your agent see every prop.",
  },
  { heading: "Tested examples", body: "Each deck's CI checks its examples, so the code you copy from the docs compiles." },
  {
    heading: "Predictable markup",
    body: "carouseldeck and playdeck name every part, and in pagedeck the markup is your own, so an agent never has to guess.",
  },
] as const;

/**
 * Only claims a test in the deck's own repo proves (GLOSSARY.md). Each claim's
 * test is listed in the PR for #45. A claim with no test is filed in that
 * deck's repo instead: pagedeck's reduced motion is pedrosousa13/pagedeck#121.
 */
const accessible = [
  {
    deck: "carouseldeck",
    claims: [
      'A labelled carousel region, each slide a group labelled "n of m".',
      "Arrow keys move the focused deck, and every dot is a button the keyboard reaches.",
      "Tab into an off-screen slide and it scrolls into view.",
      "A polite live region announces your moves, never autoplay's.",
      "Under reduced motion, moves jump instead of gliding, and autoplay starts stopped.",
    ],
  },
  {
    deck: "playdeck",
    claims: [
      "Every control is reachable by Tab, in order.",
      "Keyboard shortcuts mute, pause and seek the video itself.",
      "The settings menu takes focus when it opens and gives it back on Escape.",
      "Live regions announce changes of state, never the ticking clock.",
      "axe finds no violations in any state of the reference player.",
      "A viewer who asks for reduced motion gets no autoplay, unless you opt out.",
    ],
  },
  {
    deck: "pagedeck",
    claims: [
      "Every page gets exactly one main landmark. A component that renders a second fails the build.",
      "Search is a combobox: arrow keys walk the results, Enter follows one, Escape closes them.",
      "Text typed into search before it hydrates is kept, caret and all.",
    ],
  },
] as const;

/**
 * The home page. Its layout is design/canvas/Main.dc.html's; its hero,
 * figures and quality sections are GLOSSARY.md's "The landing pages' message".
 * Styled by umbrella.css.
 */
export default function Layout({ title }: Props) {
  return (
    <>
      <title>{title}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="icon" type="image/svg+xml" href={umbrella.icons.still} />
      <link rel="apple-touch-icon" href={umbrella.icons.appleTouch} />

      <section className="hero">
        <img src={umbrella.icons.animated} alt="" width="96" height="96" />
        <h1>
          It looks like you.{" "}
          <br />
          <span>It works like the browser.</span>
        </h1>
        <p>
          Unstyled React packages for carousels, video and sites. Bring your tokens, your CSS, or your agent. The hard parts
          are already done.
        </p>
        <div className="hero__links">
          <a href="#decks" className="hero__browse">
            Browse the decks
          </a>
        </div>
      </section>

      <section id="decks" className="decks" aria-label="The decks">
        {decks.map((deck) => (
          <article key={deck.name} id={deck.name} className="card" data-deck={deck.name}>
            <div className="card__text">
              <div className="card__head">
                <img src={deck.icons.animated} alt="" width="56" height="56" />
                <div>
                  <h2>{deck.name}</h2>
                  <p className="card__kind">{deck.kind}</p>
                </div>
              </div>
              <p className="card__claim">{deck.claim}</p>
              <p className="card__description">{deck.description}</p>
              <div className="card__install">
                <code>{deck.install}</code>
              </div>
              <a href={deck.url} className="card__visit">
                Visit {deck.name} ›
              </a>
            </div>
            <div className="card__figure">
              <p>{figureValue(deck)}</p>
              <p>{deck.figure.label}</p>
              {deck.figure.note === undefined ? null : <p>{deck.figure.note}</p>}
            </div>
          </article>
        ))}
      </section>

      <section className="band">
        <div className="band__text">
          <h2>Unstyled, your look.</h2>
          <p>
            Every deck renders plain HTML and needs no stylesheet, so there is no theme to fight. carouseldeck and playdeck
            give every part a stable name, and pagedeck renders your own components. Point your CSS or your tokens at the
            markup, and the look is yours.
          </p>
        </div>
        <pre>
          <span>[data-playdeck-part='play-button']</span>
          {" {\n  border-radius: 999px;\n}"}
        </pre>
      </section>

      <section className="band band--tiles">
        <div className="band__text">
          <h2>Small, leans on the browser.</h2>
          <p>
            The browser already knows how to scroll, play video and show a page. The decks build on what it does instead
            of rebuilding it, so there is less code to ship.
          </p>
        </div>
        <ul className="tiles">
          {browser.map(({ deck, heading, body }) => (
            <li key={deck} className="tile" data-deck={deck}>
              <h3>
                <span className="tile__deck">{deck}</span> {heading}
              </h3>
              <p className="tile__body">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="band band--tiles">
        <div className="band__text">
          <h2>Built for agents.</h2>
          <p>Whether you write the code or your coding agent does, the decks leave less to guess.</p>
        </div>
        <ul className="tiles">
          {agents.map(({ heading, body }) => (
            <li key={heading} className="tile">
              <h3>{heading}</h3>
              <p className="tile__body">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="band band--tiles">
        <div className="band__text">
          <h2>Accessible by default.</h2>
          <p>
            The decks take care of the keyboard, focus and screen readers for you. Each line below is backed by a test in
            that deck's own repo.
          </p>
        </div>
        <ul className="tiles">
          {accessible.map(({ deck, claims }) => (
            <li key={deck} className="tile" data-deck={deck}>
              <h3 className="tile__name">{deck}</h3>
              <ul>
                {claims.map((claim) => (
                  <li key={claim}>{claim}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
