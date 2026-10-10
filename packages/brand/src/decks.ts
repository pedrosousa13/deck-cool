import type { IconName } from "./icons.ts";

/** Paths each site serves, from the brand package's `public/` directory. */
export interface Icons {
  /** The favicon. */
  readonly still: string;
  /** The same icon with CSS motion, for use inside a page. */
  readonly animated: string;
  /** 180×180 PNG of the still icon. */
  readonly appleTouch: string;
}

interface FigureText {
  readonly label: string;
  /** How it was measured, shown small. */
  readonly note?: string;
}

/** A figure whose number is written here. */
export interface LiteralFigure extends FigureText {
  readonly value: string;
}

/**
 * A figure whose number each site reads from the deck's installed package as
 * it builds: slidedeck's size, from @slidedeck/react's README.
 */
export interface ReadmeFigure extends FigureText {
  readonly source: "slidedeck-readme";
}

/** A number from a deck's site, and what it counts. */
export type Figure = LiteralFigure | ReadmeFigure;

export interface Deck<F extends Figure = Figure> {
  readonly name: string;
  readonly kind: string;
  /** What the deck does, in one line. */
  readonly claim: string;
  readonly description: string;
  /** The command that installs it. */
  readonly install: string;
  readonly figure: F;
  /** The deck's canonical site. */
  readonly url: string;
  readonly accent: {
    /** A fill that carries `--fill-text`, such as a button. */
    readonly fill: string;
    /** Text and marks on a ground. */
    readonly text: string;
  };
  readonly icons: Icons;
}

function icons(name: IconName): Icons {
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

// The card copy (claim to install) was taken from each deck's live site on
// 2026-10-08, for the umbrella board (design/canvas/Main.dc.html). The one
// figure per deck is CONTEXT.md's, from #45. slidedeck's size has no value
// here: deck.cool and slidedeck's site read it from @slidedeck/react's README
// when they build, so it follows each release.
export const slidedeck: Deck<ReadmeFigure> = {
  name: "slidedeck",
  kind: "Carousel",
  claim: "A carousel that lets the browser do the scrolling.",
  description:
    "Native momentum, snapping and focus scrolling. Loop, fade, curve and autoplay as effects you import only when you use them.",
  install: "pnpm add @slidedeck/react",
  figure: { source: "slidedeck-readme", label: "for a carousel with Prev and Next", note: "min+gzip, React external" },
  url: "https://slide.deck.cool",
  accent: { fill: "#0071e3", text: "#2997ff" },
  icons: icons("slidedeck"),
};

export const playdeck: Deck<LiteralFigure> = {
  name: "playdeck",
  kind: "Video player",
  claim: "A video player you compose, not one you configure.",
  description:
    "React primitives and hooks over native video, HLS, YouTube, Vimeo and Wistia. The same six lines drive all five.",
  install: "pnpm add @playdeck/react",
  figure: { value: "0", label: "requests to YouTube or Vimeo before play" },
  url: "https://playdeck.video",
  accent: { fill: "#d9214f", text: "#ff5c86" },
  icons: icons("playdeck"),
};

export const pagedeck: Deck<LiteralFigure> = {
  name: "pagedeck",
  kind: "Site framework",
  claim: "Zero JavaScript until a page needs it.",
  description:
    "A React framework for CMS-driven sites. Each page ships only what it uses, and a per-page budget fails the build when it ships more.",
  install: "npm create pagedeck",
  figure: { value: "0 B", label: "of JavaScript on a page with nothing interactive" },
  url: "https://page.deck.cool",
  accent: { fill: "#0a7a50", text: "#3ddc97" },
  icons: icons("pagedeck"),
};

export const decks: readonly Deck[] = [slidedeck, playdeck, pagedeck];
