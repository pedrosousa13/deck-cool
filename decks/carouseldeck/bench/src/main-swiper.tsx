// Swiper's bench entry, same shape as the other four decks' entries (#340).
// No `swiper.css`: swiper-app.tsx needs none beyond `swiper/css`, imported
// there.
import { createRoot } from 'react-dom/client';
import './style.css';
import { SLIDE_COUNT } from './content';
import { attachHarness, markInitEnd, markInitStart } from './harness';
import { SwiperApp } from './swiper-app';

markInitStart();
attachHarness({
  trackSelector: '[data-bench-slide="0"]',
  dotsSelector: '[data-bench-dots]',
  slideCount: SLIDE_COUNT
});

createRoot(document.getElementById('app')!).render(<SwiperApp />);
markInitEnd();
