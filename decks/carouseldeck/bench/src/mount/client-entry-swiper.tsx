// The swiper mount page's client entry (#340). See
// client-entry-carouseldeck.tsx's own header comment for the shape every
// one of these five files follows. No extra CSS import here: swiper-app.tsx
// already imports `swiper/css`.

import { createRoot, hydrateRoot } from 'react-dom/client';
import '../style.css';
import { SwiperApp } from '../swiper-app';
import { SLIDE_COUNT } from '../content';
import { attachMountHarness } from './harness';
import { MountApp } from './mount-app';

attachMountHarness({ slideCount: SLIDE_COUNT });
window.__mount.markStart();

const root = document.getElementById('root')!;
const { n, dirty } = window.__mountConfig;
const element = <MountApp n={n} dirty={dirty} Deck={SwiperApp} />;

if (root.getAttribute('data-ssr') === '1') {
  hydrateRoot(root, element);
} else {
  createRoot(root).render(element);
}
