// The five carousels this bench drives (#340, ported from
// decks/drawerdeck/bench/decks.ts, #266/#283). Every page shares
// `window.__bench` (src/harness.ts), a `#next`/`#prev` pair of buttons and a
// dots bar `harness.ts` reads `published()`/`index()` off of. `url` is the
// no-loop page; `?loop=1` on the same page is the loop-on variant, for every
// deck here (all five support `loop`), so this bench never doubles its Vite
// entries or HTML pages for the two variants the issue asks for.

export interface DeckDef {
  key: string;
  label: string;
  url: string;
}

export const DECKS: DeckDef[] = [
  {
    key: 'carouseldeck',
    label: '@carouseldeck/react (workspace:*)',
    url: 'bench-carouseldeck.html'
  },
  {
    key: 'embla',
    label: 'embla-carousel-react 8.6.0 (2025-04-04)',
    url: 'bench-embla.html'
  },
  {
    key: 'keen',
    label: 'keen-slider 6.8.6 (2023-07-05)',
    url: 'bench-keen.html'
  },
  {
    key: 'swiper',
    label: 'swiper 14.4.0 (2026-10-30)',
    url: 'bench-swiper.html'
  },
  {
    key: 'splide',
    label:
      '@splidejs/react-splide 0.7.12 + @splidejs/splide 4.1.4 (2022-09-30 / 2022-11-09)',
    url: 'bench-splide.html'
  }
];

export function urlFor(deck: DeckDef, loop: boolean): string {
  return loop ? `${deck.url}?loop=1` : deck.url;
}
