// Splide's bench entry, same shape as the other four decks' entries (#340).
// No `splide.css`: splide-app.tsx needs none beyond
// `@splidejs/react-splide/css`, imported there.
import { createRoot } from 'react-dom/client';
import './style.css';
import { SLIDE_COUNT } from './content';
import { attachHarness, markInitEnd, markInitStart } from './harness';
import { SplideApp } from './splide-app';

markInitStart();
attachHarness({
  trackSelector: '[data-bench-slide="0"]',
  dotsSelector: '[data-bench-dots]',
  slideCount: SLIDE_COUNT
});

createRoot(document.getElementById('app')!).render(<SplideApp />);
markInitEnd();
