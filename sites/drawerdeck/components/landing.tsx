// The home page at /: a trimmed version of GLOSSARY.md's "The landing pages'
// message", since the beta API is not built yet (#240). A server component:
// it ships no JavaScript of its own but the demo, which is an island.
import { umbrella } from "@deck-cool/brand/decks";
import { drawerdeck } from "./drawerdeck.ts";
import Quickstart from "./demos/example-quickstart.tsx";

export default function Landing() {
  return (
    <>
      <section className="home-intro">
        <img src={drawerdeck.icons.animated} alt="" width="96" height="96" />
        <h1>
          A drawer that lets <br />
          <span>the browser do the dragging.</span>
        </h1>
        <p>
          Compose it from a few React parts, style every one with your own CSS, or hand it to your agent. The drag,
          the momentum and the snap points are native scroll snap, and {"<dialog>"} gives the top layer, focus trap
          and Escape for free.
        </p>
        <div className="home-intro__actions">
          {/* No Copy button, which would be one more island: one click selects the command. */}
          <div className="home-install">
            <code>{drawerdeck.install}</code>
          </div>
          <a className="home-button" href="/docs/">
            Read the docs
          </a>
        </div>
      </section>

      <section className="home-band" aria-labelledby="demo">
        <div className="home-band__text">
          <h2 id="demo">See the shape of it</h2>
          <p>
            {"@drawerdeck/core"} and {"@drawerdeck/react"} are still placeholders while the beta is built (#240), so
            the drawer below is a static mock, not a live one. It will be replaced with a live {"<Drawer.*>"} demo
            once the engine and the primitives land.
          </p>
        </div>
        <Quickstart />
      </section>

      <section className="home-band" aria-labelledby="why">
        <div className="home-band__text">
          <h2 id="why">Why native scrolling</h2>
          <p>
            Two existing drawers drive the drag, the momentum and the snap points from JavaScript. drawerdeck's are
            native scroll snap instead, with {"<dialog>"} for the top layer, focus trapping and Escape.
          </p>
          <a className="home-more" href="/docs/guides/why-native-scrolling/">
            Read why ›
          </a>
        </div>
      </section>

      <section className="home-family">
        <p>
          drawerdeck is part of deck.cool, a family of unstyled React packages that look like you and work like the
          browser.{" "}
          <a className="home-more" href={umbrella.url}>
            Meet the family ›
          </a>
        </p>
      </section>
    </>
  );
}
