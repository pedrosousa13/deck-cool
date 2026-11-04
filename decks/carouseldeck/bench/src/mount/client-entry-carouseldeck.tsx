// The carouseldeck mount page's client entry (#340). Built by
// `../../vite.config.ts` to a fixed `mount-carouseldeck.client.js`, which
// `scripts/generate-mount-pages.mjs` references by that exact name from
// every static `mount-carouseldeck-*.html` page it writes, alongside an
// inline `window.__mountConfig` script that sets `n`/`dirty` before this
// module runs. `attachMountHarness`'s call and `markStart()` are this
// module's first two statements -- the "hydration (or client render)
// start" #340's mount lessons score from, including whatever part of the
// task that already ran to load and evaluate this module and its own
// dependencies (`trace.ts`'s own `analyzeMount` counts the whole task that
// contains this mark, not only the part after it).
//
// Hydrates when the root element already carries server-rendered markup
// (`data-ssr="1"`, set by `generate-mount-pages.mjs` only on the `-ssr.html`
// variant); renders client-side from empty otherwise. Both branches render
// the exact same `MountApp`/`CarouseldeckApp` tree `ssr-entry-carouseldeck.tsx`
// used to produce the server markup, so hydration never mismatches.

import { createRoot, hydrateRoot } from 'react-dom/client';
import '../style.css';
import { CarouseldeckApp } from '../carouseldeck-app';
import { SLIDE_COUNT } from '../content';
import { attachMountHarness } from './harness';
import { MountApp } from './mount-app';

attachMountHarness({ slideCount: SLIDE_COUNT });
window.__mount.markStart();

const root = document.getElementById('root')!;
const { n, dirty } = window.__mountConfig;
const element = <MountApp n={n} dirty={dirty} Deck={CarouseldeckApp} />;

if (root.getAttribute('data-ssr') === '1') {
  hydrateRoot(root, element);
} else {
  createRoot(root).render(element);
}
