// @splidejs/react-splide@0.7.12's `./css` export has no `types` condition
// and no `.css` suffix in its own specifier (unlike `vite/client`'s
// `declare module '*.css'` wildcard, or Swiper's own per-subpath `.d.ts`
// stubs), so splide-app.tsx's side-effect import of it needs its own
// ambient declaration. See tsconfig.json's own comment on the matching
// `@splidejs/react-splide` `paths` entry for the same package's other gap.
declare module '@splidejs/react-splide/css';
