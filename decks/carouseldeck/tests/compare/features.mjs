// What scripts/compare-libraries.mjs cannot measure, written down with where
// each claim was read. The size column is measured; these are not. Each
// competitor's claims were read from the version pinned in package.json
// here, so a version bump means reading them again.

/**
 * @typedef {{
 *   package: string;
 *   entry: string;
 *   nativeScroll: string;
 *   accessibility: string;
 *   api: string;
 *   sources: string[];
 * }} Library
 */

/** @type {Library[]} */
export const libraries = [
  {
    package: '@carouseldeck/react',
    entry: 'entries/carouseldeck.tsx',
    nativeScroll: 'Yes: CSS scroll snap in a real scroll container',
    accessibility:
      'Labelled carousel region, slides labelled "n of m", button controls, dots with `aria-current`, a polite live region, loop shells and copies inert',
    api: 'Components (`Deck.Root`, `Deck.Viewport`, `Deck.Slide`, controls), controlled `index` and a handle',
    sources: [
      'packages/react/src/index.tsx',
      'docs/adr/0001-native-scroll-snap-is-the-engine.md',
      'docs/adr/0004-dots-are-buttons.md'
    ]
  },
  {
    package: 'embla-carousel-react',
    entry: 'entries/embla.tsx',
    nativeScroll: 'No: `translate3d` transforms and its own physics',
    accessibility:
      'No roles, labels or controls; scrolls a focused slide into view',
    api: 'A hook returning a ref and an API object; markup and controls are yours',
    sources: [
      'embla-carousel 8.6.0 `esm/embla-carousel.esm.js`: sets `transform: translate3d(…)`, no `aria-` or `role`, a `slideFocus` handler',
      'embla-carousel-react 8.6.0 `esm/embla-carousel-react.esm.js`: exports the `useEmblaCarousel` hook',
      'the accessibility cell is for 8.6.0: Embla v9, in prerelease, adds an optional `embla-carousel-accessibility` plugin (9.0.0-rc01 to rc03 on npm)'
    ]
  },
  {
    package: 'keen-slider',
    entry: 'entries/keen.tsx',
    nativeScroll: 'No: `translate3d` transforms and its own physics',
    accessibility: 'No roles, labels, controls or keyboard handling',
    api: 'A hook returning a ref and an instance, plus a required stylesheet; markup and controls are yours',
    sources: [
      'keen-slider 6.8.6 `react.js`: sets `translate3d(…)`, no `aria-`, `role` or `keydown`; exports the `useKeenSlider` hook',
      'keen-slider 6.8.6 `keen-slider.css`: the `display: flex` and `overflow: hidden` the slider needs'
    ]
  }
];
