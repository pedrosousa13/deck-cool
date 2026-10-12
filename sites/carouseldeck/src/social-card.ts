// The social card each page shares with: a 1200 by 630 PNG on the brand's
// dark ground, with carouseldeck's icon, drawn by build.socialImages. satori lays
// the card out as an SVG, and resvg paints it.
//
// The site sets its text in the system SF stack, which a build machine may
// not have, and satori shapes only the fonts it is given. So the card has a
// face of its own, checked in: Inter SemiBold, under the SIL Open Font
// License (fonts/OFL.txt), the nearest freely licensed face to SF Pro.
// fonts/ is the build's alone: the site never serves it.

import { readFileSync } from "node:fs";
import type { SocialImageAdapter } from "@pagedeck/core";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

const WIDTH = 1200;
const HEIGHT = 630;
const PADDING = 72;

/** brand.css's palette. */
const COLOUR = {
  ground: "#000",
  text: "#f5f5f7",
  secondary: "#a1a1a6",
  accent: "#0071e3",
} as const;

const FONT_FILE = new URL("../fonts/Inter-SemiBold.woff", import.meta.url);

/** The card's font file. A missing file fails the build, naming it. */
export function loadFont(file: string | URL): Buffer {
  try {
    return readFileSync(file);
  } catch {
    throw new Error(
      `Social card: its font, ${String(file)}, is missing — restore Inter SemiBold there, with its licence in fonts/OFL.txt`,
    );
  }
}

const ICON = readFileSync(new URL("../node_modules/@deck-cool/brand/public/icons/carouseldeck/still.svg", import.meta.url));

/**
 * The headline's lines, broken between words. A glyph is taken as 0.6em
 * wide, wider than most, so a line fits the card.
 */
export function lines(text: string, fontSize: number, width: number): string[] {
  const perLine = Math.floor(width / (fontSize * 0.6));
  const out: string[] = [];
  for (const word of text.split(/\s+/)) {
    const last = out.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= perLine) out[out.length - 1] = `${last} ${word}`;
    else out.push(word);
  }
  return out;
}

// satori walks a tree shaped like React elements, and refuses a box without
// `display: flex`.
type Node = { type: string; props: Record<string, unknown> };
const box = (style: Record<string, unknown>, children?: unknown): Node => ({
  type: "div",
  props: { style: { display: "flex", ...style }, children },
});

function card(headline: string, host: string): Node {
  const fontSize = headline.length > 40 ? 64 : 80;
  return box(
    {
      flexDirection: "column",
      justifyContent: "space-between",
      width: "100%",
      height: "100%",
      padding: `64px ${PADDING}px`,
      backgroundColor: COLOUR.ground,
      color: COLOUR.text,
      fontFamily: "Inter",
      borderBottom: `16px solid ${COLOUR.accent}`,
    },
    [
      box({ alignItems: "center", gap: 20 }, [
        {
          type: "img",
          props: { src: `data:image/svg+xml;base64,${ICON.toString("base64")}`, width: 72, height: 72 },
        },
        box({ fontSize: 40, letterSpacing: "-0.02em" }, "carouseldeck"),
      ]),
      box(
        { flexDirection: "column", fontSize, lineHeight: 1.1, letterSpacing: "-0.025em" },
        lines(headline, fontSize, WIDTH - 2 * PADDING).map((line) => box({}, line)),
      ),
      box({ fontSize: 28, color: COLOUR.secondary }, host),
    ],
  );
}

/** The card renderer. Each page's `inputs` give its `headline`. */
export function socialCard(origin: string): SocialImageAdapter {
  const host = new URL(origin).host;
  const fonts = [{ name: "Inter", weight: 600 as const, style: "normal" as const, data: loadFont(FONT_FILE) }];
  return {
    name: "carouseldeck social card",
    async draw({ inputs, title }) {
      const headline = typeof inputs["headline"] === "string" ? inputs["headline"] : title;
      if (headline === undefined) throw new Error("Social card: the page has no headline to draw.");
      const svg = await satori(card(headline, host) as Parameters<typeof satori>[0], {
        width: WIDTH,
        height: HEIGHT,
        fonts,
        embedFont: true,
      });
      // satori drew the text as paths, so resvg needs no font, and the build
      // machine's own stay out of the card.
      const bytes = new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
      return { bytes, width: WIDTH, height: HEIGHT };
    },
  };
}
