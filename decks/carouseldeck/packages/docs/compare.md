---
title: Comparison with Embla and Keen
label: Compare
description: 'How carouseldeck compares with Embla and Keen Slider: native scrolling against transforms, accessibility out of the box, API shape and min+gzip size.'
---

Embla and Keen move slides with transforms and their own physics. Carouseldeck
lets the browser scroll. `pnpm compare` measures the size column from pinned
installs, and CI fails if this table is stale.

| Library                | Version   | Min+gzip | Native scroll                                    | Accessibility out of the box                                                                                                                      | API shape                                                                                          |
| ---------------------- | --------- | -------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `@carouseldeck/react`  | this repo | 12.29 KB | Yes: CSS scroll snap in a real scroll container  | Labelled carousel region, slides labelled "n of m", button controls, dots with `aria-current`, a polite live region, loop shells and copies inert | Components (`Deck.Root`, `Deck.Viewport`, `Deck.Slide`, controls), controlled `index` and a handle |
| `embla-carousel-react` | 8.6.0     | 7.61 KB  | No: `translate3d` transforms and its own physics | No roles, labels or controls; scrolls a focused slide into view                                                                                   | A hook returning a ref and an API object; markup and controls are yours                            |
| `keen-slider`          | 6.8.6     | 6.61 KB  | No: `translate3d` transforms and its own physics | No roles, labels, controls or keyboard handling                                                                                                   | A hook returning a ref and an instance, plus a required stylesheet; markup and controls are yours  |

Min+gzip: each entry in `tests/compare/entries` is the same basic deck for all three, three slides with Previous and Next and no dots, bundled by Vite 8.3.1 with React external, minified, then gzipped, with the stylesheet the library needs. Each imports what its library documents: Keen's `keen-slider/react` has no exports map and resolves to its CommonJS build. Carouseldeck's row is measured from this repo's build, so it has no version. The other columns, and where each was read:

- `@carouseldeck/react`: packages/react/src/index.tsx; docs/adr/0001-native-scroll-snap-is-the-engine.md; docs/adr/0004-dots-are-buttons.md.
- `embla-carousel-react`: embla-carousel 8.6.0 `esm/embla-carousel.esm.js`: sets `transform: translate3d(…)`, no `aria-` or `role`, a `slideFocus` handler; embla-carousel-react 8.6.0 `esm/embla-carousel-react.esm.js`: exports the `useEmblaCarousel` hook; the accessibility cell is for 8.6.0: Embla v9, in prerelease, adds an optional `embla-carousel-accessibility` plugin (9.0.0-rc01 to rc03 on npm).
- `keen-slider`: keen-slider 6.8.6 `react.js`: sets `translate3d(…)`, no `aria-`, `role` or `keydown`; exports the `useKeenSlider` hook; keen-slider 6.8.6 `keen-slider.css`: the `display: flex` and `overflow: hidden` the slider needs.
