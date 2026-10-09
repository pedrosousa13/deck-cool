import { decks, umbrella } from "@deck-cool/brand/decks";

interface Props {
  title: string;
}

/** The home page (design/canvas/Main.dc.html). Styled by umbrella.css. */
export default function Layout({ title }: Props) {
  return (
    <>
      <title>{title}</title>
      <link rel="icon" type="image/svg+xml" href={umbrella.icons.still} />
      <link rel="apple-touch-icon" href={umbrella.icons.appleTouch} />

      <section className="hero">
        <img src={umbrella.icons.animated} alt="" width="96" height="96" />
        <h1>
          React, unstyled.{" "}
          <br />
          <span>One deck at a time.</span>
        </h1>
        <p>
          Small React packages that lean on what the browser already does. None of them ships a stylesheet. The look is
          yours.
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
            <ul className="card__figures">
              {deck.figures.map(({ value, label }) => (
                <li key={value}>
                  <span>{value}</span>
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="band">
        <div>
          <h2>No stylesheet ships.</h2>
          <p>
            Every deck renders plain markup with stable part names. You style it with your own CSS, in your own design
            system.
          </p>
        </div>
        <pre>
          <span>[data-playdeck-part='play-button']</span>
          {" {\n  border-radius: 999px;\n}"}
        </pre>
      </section>
    </>
  );
}
