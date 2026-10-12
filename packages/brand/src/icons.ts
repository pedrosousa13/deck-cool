/** The icons in `public/icons/`: the umbrella's, then each deck's. */
export const ICON_NAMES = ["deck-cool", "carouseldeck", "playdeck", "pagedeck"] as const;

export type IconName = (typeof ICON_NAMES)[number];
