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
 * it builds: carouseldeck's size, from @carouseldeck/react's README at its
 * latest release.
 */
export interface ReadmeFigure extends FigureText {
  readonly source: "carouseldeck-readme";
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
// figure per deck is GLOSSARY.md's, from #45. carouseldeck is slidedeck renamed
// (#105), so its copy is the board's slidedeck copy. Its size has no value
// here: deck.cool and carouseldeck's site read it from @carouseldeck/react's
// README when they build, so it follows each release.
export const carouseldeck: Deck<ReadmeFigure> = {
  name: "carouseldeck",
  kind: "Carousel",
  claim: "A carousel that lets the browser do the scrolling.",
  description:
    "Native momentum, snapping and focus scrolling. Loop, fade, curve and autoplay as effects you import only when you use them.",
  install: "pnpm add @carouseldeck/react",
  figure: { source: "carouseldeck-readme", label: "for a carousel with Prev and Next", note: "min+gzip, React external" },
  // carousel.deck.cool. slide.deck.cool redirects here (#105, docs/deploy.md).
  url: "https://carousel.deck.cool",
  accent: { fill: "#0071e3", text: "#2997ff" },
  icons: icons("carouseldeck"),
};

export const playdeck: Deck<LiteralFigure> = {
  name: "playdeck",
  kind: "Video player",
  claim: "A video player you compose, not one you configure.",
  description:
    "React primitives and hooks over native video, HLS, YouTube, Vimeo and Wistia. The same six lines drive all five.",
  install: "pnpm add @playdeck/react",
  figure: { value: "0", label: "requests to YouTube or Vimeo before play" },
  url: "https://play.deck.cool",
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

export const drawerdeck: Deck<LiteralFigure> = {
  name: "drawerdeck",
  kind: "Drawer",
  claim: "A drawer that lets the browser do the dragging.",
  description:
    "Native scroll snap drives the drag, momentum and snap points, and <dialog> gives the top layer, focus trap and Escape for free.",
  install: "pnpm add @drawerdeck/react",
  figure: { value: "0", label: "third-party libraries driving the drag" },
  url: "https://drawer.deck.cool",
  accent: { fill: "#7c3aed", text: "#bf5af2" },
  icons: icons("drawerdeck"),
};

export const decks: readonly Deck[] = [carouseldeck, playdeck, pagedeck, drawerdeck];
