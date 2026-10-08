/** Paths each site serves, from the brand package's `public/` directory. */
export interface Icons {
  /** The favicon. */
  readonly still: string;
  /** The same icon with CSS motion, for use inside a page. */
  readonly animated: string;
  /** 180×180 PNG of the still icon. */
  readonly appleTouch: string;
}

export interface Deck {
  readonly name: string;
  readonly kind: string;
  /** The deck's canonical site. */
  readonly url: string;
  readonly accent: {
    /** A fill that carries `--text`, such as a button. */
    readonly fill: string;
    /** Text and marks on a ground. */
    readonly text: string;
  };
  readonly icons: Icons;
}

function icons(name: string): Icons {
  return {
    still: `/icons/${name}/still.svg`,
    animated: `/icons/${name}/animated.svg`,
    appleTouch: `/icons/${name}/apple-touch-icon.png`,
  };
}

export const umbrella = {
  name: "deck.cool",
  url: "https://deck.cool",
  icons: icons("deck-cool"),
} as const;

export const decks: readonly Deck[] = [
  {
    name: "slidedeck",
    kind: "Carousel",
    url: "https://slide.deck.cool",
    accent: { fill: "#0071e3", text: "#2997ff" },
    icons: icons("slidedeck"),
  },
  {
    name: "playdeck",
    kind: "Video player",
    url: "https://playdeck.video",
    accent: { fill: "#d9214f", text: "#ff5c86" },
    icons: icons("playdeck"),
  },
  {
    name: "pagedeck",
    kind: "Site framework",
    url: "https://page.deck.cool",
    accent: { fill: "#0a7a50", text: "#3ddc97" },
    icons: icons("pagedeck"),
  },
];
