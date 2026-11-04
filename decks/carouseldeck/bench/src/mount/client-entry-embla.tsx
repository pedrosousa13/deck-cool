// The embla mount page's client entry (#340). See
// client-entry-carouseldeck.tsx's own header comment for the shape every
// one of these five files follows. Imports `embla.css` (the positioning
// recipe embla-app.tsx needs): the mount scenario measures the same markup
// and CSS the gesture bench does, not a bare, unstyled page.

import { createRoot, hydrateRoot } from 'react-dom/client';
import '../embla.css';
import { EmblaApp } from '../embla-app';
import { SLIDE_COUNT } from '../content';
import { attachMountHarness } from './harness';
import { MountApp } from './mount-app';

attachMountHarness({ slideCount: SLIDE_COUNT });
window.__mount.markStart();

const root = document.getElementById('root')!;
const { n, dirty } = window.__mountConfig;
const element = <MountApp n={n} dirty={dirty} Deck={EmblaApp} />;

if (root.getAttribute('data-ssr') === '1') {
  hydrateRoot(root, element);
} else {
  createRoot(root).render(element);
}
