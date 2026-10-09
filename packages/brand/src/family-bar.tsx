import { decks, type Deck, type umbrella } from "./decks.ts";

export interface FamilyBarLink {
  readonly label: string;
  readonly href: string;
}

export interface FamilyBarProps {
  /** The deck whose site this is, or the umbrella on deck.cool. */
  readonly current: Deck | typeof umbrella;
  /** The site's own links, such as Docs, Examples and GitHub. */
  readonly links: readonly FamilyBarLink[];
  /** Where the Install pill points. No pill without it. */
  readonly install?: string;
}

/** The switcher's panel. One bar per page, so a fixed id. */
const PANEL = "family-bar-decks";

/**
 * The top bar every deck.cool site shares (design direction C). The switcher
 * is a popover its button toggles, which closes on Escape and on a click
 * outside it. Every motion is CSS in `styles/family-bar.css`, which a site
 * lists in its `build.css`, so the bar ships no JavaScript.
 */
export function FamilyBar({ current, links, install }: FamilyBarProps) {
  const deck = "kind" in current ? current : undefined;
  return (
    <header className="family-bar" data-deck={deck?.name}>
      <nav aria-label="Main" className="family-bar__row">
        <button type="button" className="family-bar__switch" popoverTarget={PANEL} aria-label="Switch deck">
          <svg className="family-bar__fan" width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
            <rect className="family-bar__fan-left" x="22" y="15" width="20" height="28" rx="4" />
            <rect className="family-bar__fan-right" x="22" y="15" width="20" height="28" rx="4" />
            <rect className="family-bar__fan-front" x="22" y="15" width="20" height="28" rx="4" />
          </svg>
          <svg className="family-bar__chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 3.5 L5 6.5 L8 3.5" />
          </svg>
        </button>
        {/* The panel covers the page under the bar: the sheet of decks, then
            the shade, which closes the panel and keeps the click from the page. */}
        <div id={PANEL} popover="auto" className="family-bar__panel">
          <div className="family-bar__sheet">
            <div className="family-bar__decks">
              <p id={`${PANEL}-label`}>The decks</p>
              <ul aria-labelledby={`${PANEL}-label`}>
                {decks.map((each) => (
                  <li key={each.name}>
                    <a href={each.url} aria-current={each === deck ? "page" : undefined}>
                      {/* Low priority, and not lazy: React then writes no preload,
                          and the icons are there before the panel first opens. */}
                      <img src={each.icons.still} alt="" width="44" height="44" fetchPriority="low" />
                      <span>
                        <strong>{each.name}</strong>
                        <span>{each.kind}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <button
            type="button"
            className="family-bar__shade"
            popoverTarget={PANEL}
            popoverTargetAction="hide"
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
        {deck && (
          <span className="family-bar__slash" aria-hidden="true">
            /
          </span>
        )}
        <a href="/" className="family-bar__name">
          <span>{current.name}</span>
        </a>
        {links.length > 0 && (
          <ul className="family-bar__links">
            {links.map(({ label, href }) => (
              <li key={href}>
                <a href={href}>{label}</a>
              </li>
            ))}
          </ul>
        )}
        {install && (
          <a href={install} className="family-bar__install">
            Install
          </a>
        )}
      </nav>
    </header>
  );
}
