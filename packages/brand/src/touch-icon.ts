import { Resvg } from "@resvg/resvg-js";

/** Renders a still icon as the 180×180 PNG iOS uses for a home-screen icon. */
export function renderTouchIcon(svg: Buffer): Buffer {
  return new Resvg(svg, { fitTo: { mode: "width", value: 180 } }).render().asPng();
}
