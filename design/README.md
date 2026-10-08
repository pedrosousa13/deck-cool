# Design source

The decisions are in `../CONTEXT.md`. This folder holds the material they were made from.

## `favicons/`

Real SVG files, 64×64 viewBox, ready to use.

- `still/`: the favicon each site ships.
- `animated/`: the same icons with CSS motion, for use inside a page. Each one holds still under `prefers-reduced-motion`.
- `parked/`: formdeck, not to be used until the maintainer says it is ready.

## `canvas/`

The source of the design canvas boards (https://claude.ai/artifact/QjhCKzzVi3X3Bg3WP7fWWR). They are `.dc.html` files for the canvas runtime and do not open on their own. Read them for exact values: markup, colours, sizes, keyframes.

| Board | Status |
| --- | --- |
| `Main.dc.html` | Chosen: the umbrella site |
| `NavFamily.dc.html` | Chosen: the Family bar (direction C) |
| `Favicons2.dc.html` | Chosen: the favicons (round 2) |
| `Favicons2Motion.dc.html` | Chosen: the favicons' motion |
| `FormdeckParked.dc.html` | Parked: formdeck |
| `NavIsland.dc.html` | Not chosen: direction A. Its shrink-on-scroll capsule may join the Family bar later |
| `NavGlide.dc.html` | Not chosen: direction B |
| `Favicons.dc.html`, `Favicons3.dc.html`, `Favicons4.dc.html` | Not chosen: favicon rounds 1, 3 and 4 |

The umbrella site's copy for each deck is real: it was taken from slidedeck.pages.dev, playdeck.video and pagedeck's landing page on 2026-10-08.
