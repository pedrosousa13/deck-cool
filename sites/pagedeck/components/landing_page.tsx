import { decks, umbrella, type Deck } from "@deck-cool/brand/decks";
import { SkinSheet } from "@deck-cool/brand/skin-sheet";
import { formatBytes, utf8Bytes } from "../src/bytes.ts";
import { PICKER, PRODUCT } from "../src/product.ts";
import type { Skin } from "../src/skins.ts";
import { DOCS_ORIGIN, PATHS } from "./links.ts";

function find(name: string): Deck {
  const deck = decks.find((each) => each.name === name);
  if (deck === undefined) throw new Error(`the decks module has no ${name}`);
  return deck;
}

const pagedeck = find("pagedeck");

/**
 * The maintainer's lead on #48: "like Astro, if Astro were made for React".
 * Each point holds for both: Astro ships no JavaScript on a page with nothing
 * interactive and hydrates islands; its pages are .astro files, and a React
 * island needs a client:* directive at every use (pagedeck's
 * docs/research/2026-08-23-build-vs-adopt.md, and decision 24 of its design).
 */
const points = [
  {
    heading: "Interactive only where you need it",
    body: 'Mark a component "use client" once, in its own file. Every page that uses it comes alive there, and every page that does not stays plain HTML. Developers call these parts islands.',
  },
  {
    heading: "Zero JavaScript by default",
    body: "A page with nothing to click, type or play ships plain HTML and CSS, without a single script.",
  },
  {
    heading: "React all the way down",
    body: "Pages, layouts and interactive parts are all React components. There is no template language to learn and no wrapper file to write.",
  },
] as const;

const agents = [
  {
    heading: "Just React",
    body: 'Pages are React components, and interactive parts use React\'s own "use client". An agent that knows React already knows how to build here.',
  },
  {
    heading: "Typed from the config down",
    body: "pagedeck is written in TypeScript and ships its types, so your editor and your agent see every option.",
  },
  {
    heading: "Mistakes stop the build",
    body: "Ship more JavaScript than a page's budget, link to a page that does not exist, or render a second main landmark, and the build stops. Your agent hears about it before your readers do.",
  },
] as const;

/**
 * Only claims a test in pedrosousa13/pagedeck proves, as listed in #46. No
 * reduced-motion claim until pedrosousa13/pagedeck#121 is fixed.
 */
const accessible = [
  {
    heading: "One main landmark",
    body: "Every page gets exactly one main landmark. A component that renders a second fails the build.",
  },
  {
    heading: "Search from the keyboard",
    body: "Search is a combobox: arrow keys walk the results, Enter follows one, Escape closes them.",
  },
  { heading: "Nothing typed is lost", body: "Type into search before its script has loaded, and your text is kept, caret and all." },
] as const;

/** One teaser, set from the CMS entry the content page reads. Both skins render this same markup. */
function Teaser() {
  return (
    <article className="teaser">
      <h3>{PRODUCT.name}</h3>
      <p>{PRODUCT.tagline}</p>
      <p>{PICKER.price}</p>
      <a href={PATHS.cmsDemo}>See the whole product</a>
    </article>
  );
}

function Tiles({ tiles }: { tiles: readonly { readonly heading: string; readonly body: string }[] }) {
  return (
    <ul className="fw-tiles">
      {tiles.map(({ heading, body }) => (
        <li key={heading} className="fw-tile">
          <h3>{heading}</h3>
          <p className="fw-tile__body">{body}</p>
        </li>
      ))}
    </ul>
  );
}

/**
 * The home page: CONTEXT.md's "The landing pages' message", in the layout of
 * deck.cool's home page. Styled by pagedeck.css and the two skins' sheets.
 */
export default function LandingPage({ skins }: { skins: readonly Skin[] }) {
  const read = formatBytes(utf8Bytes(JSON.stringify(PRODUCT)));
  const sent = formatBytes(utf8Bytes(JSON.stringify(PICKER)));
  return (
    <>
      <section className="fw-intro">
        <img src={pagedeck.icons.animated} alt="" width="96" height="96" />
        <p className="fw-intro__lead">Like Astro, if Astro were made for React.</p>
        <h1>
          Zero JavaScript <br />
          <span>until a page needs it.</span>
        </h1>
        <p>
          Build it in React, style it with your own CSS, or hand it to your agent. Every page reaches your visitors as
          finished HTML, and only the parts you make interactive bring any JavaScript.
        </p>
        <div className="fw-intro__actions">
          {/* The page ships no script, so there is no Copy button: one click selects the command. */}
          <div className="fw-install">
            <code>{pagedeck.install}</code>
          </div>
          <a className="fw-button" href={`${DOCS_ORIGIN}/`}>
            Read the docs
          </a>
        </div>
      </section>

      <section className="fw-proof" aria-labelledby="proof">
        <div className="fw-proof__text">
          <h2 id="proof">As light as plain HTML. Built like a React app.</h2>
          <ul className="fw-proof__points">
            {points.map(({ heading, body }) => (
              <li key={heading}>
                <h3>{heading}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="fw-proof__figure">
          <p>{pagedeck.figure.value}</p>
          <p>{pagedeck.figure.label}</p>
          <p>This page, measured when the site was built. One byte more and the build fails.</p>
          <a className="fw-more" href={PATHS.interactive}>
            See one interactive page, and what it costs ›
          </a>
        </div>
      </section>

      <section className="fw-band" aria-labelledby="unstyled">
        <div className="fw-band__text">
          <h2 id="unstyled">Unstyled, your look.</h2>
          <p>
            pagedeck brings no CSS and no theme, so there is nothing to undo: the markup is your own React. Here is one
            product card, drawn twice from the same content. Only the stylesheet changes, and neither look costs a byte
            of JavaScript.
          </p>
        </div>
        <div className="fw-skins">
          {skins.map((skin) => (
            <figure key={skin.name} className="fw-skin">
              <figcaption>{skin.name}</figcaption>
              <div className={`fw-skin__stage ${skin.className}`}>
                <Teaser />
              </div>
              <SkinSheet name={skin.name} css={skin.css} html={skin.html} />
            </figure>
          ))}
        </div>
        <div className="fw-skins__more">
          <a className="fw-button" href={PATHS.interactive}>
            See an interactive page ›
          </a>
          <a className="fw-button" href={PATHS.cmsDemo}>
            See how content ships ›
          </a>
        </div>
      </section>

      <section className="fw-band" aria-labelledby="small">
        <div className="fw-band__text">
          <h2 id="small">Small, leans on the browser.</h2>
          <p>
            The browser already knows how to show a page. pagedeck hands it finished HTML and steps aside, so the only
            JavaScript on a page is the JavaScript that page asked for.
          </p>
        </div>
        <ul className="fw-tiles">
          <li className="fw-tile">
            <h3>HTML first</h3>
            <p className="fw-tile__body">
              Every page becomes finished HTML before anyone visits, so your words are on screen before a single script
              runs.
            </p>
          </li>
          <li className="fw-tile">
            <h3>Budgets that hold</h3>
            <p className="fw-tile__body">
              Give each page a JavaScript budget, and the build fails when a page ships one byte more. This page's budget
              is {pagedeck.figure.value}.
            </p>
          </li>
          <li className="fw-tile">
            <h3>Only what the page shows ships</h3>
            <p className="fw-tile__body">
              pagedeck reads your whole CMS entry while it builds the site, and sends the browser only what the page
              needs. On the content demo it reads {read} and sends the browser {sent} of data.
            </p>
            <a className="fw-more" href={PATHS.cmsDemo}>
              See the content demo ›
            </a>
          </li>
        </ul>
      </section>

      <section className="fw-band" aria-labelledby="agents">
        <div className="fw-band__text">
          <h2 id="agents">Built for agents.</h2>
          <p>Whether you write the code or your coding agent does, pagedeck leaves less to guess.</p>
        </div>
        <Tiles tiles={agents} />
      </section>

      <section className="fw-band" aria-labelledby="accessible">
        <div className="fw-band__text">
          <h2 id="accessible">Accessible by default.</h2>
          <p>
            pagedeck looks after page structure and search for you, for keyboard and screen reader users alike. Each
            line below is backed by a test in pagedeck's own repo.
          </p>
          <a className="fw-more" href={`${PATHS.features}#search`}>
            Try the search ›
          </a>
        </div>
        <Tiles tiles={accessible} />
      </section>

      <section className="fw-family">
        <p>
          pagedeck is part of deck.cool, a family of unstyled React packages that look like you and work like the
          browser. <a className="fw-more" href={umbrella.url}>
            Meet the family ›
          </a>
        </p>
      </section>
    </>
  );
}
