import { Resvg } from "@resvg/resvg-js";

/** The icons in `public/icons/`: the umbrella's, then each deck's. */
export const ICON_NAMES = ["deck-cool", "slidedeck", "playdeck", "pagedeck"];

/** Renders a still icon as the 180×180 PNG iOS uses for a home-screen icon. */
export function renderTouchIcon(svg: Buffer): Buffer {
  return new Resvg(svg, { fitTo: { mode: "width", value: 180 } }).render().asPng();
}
