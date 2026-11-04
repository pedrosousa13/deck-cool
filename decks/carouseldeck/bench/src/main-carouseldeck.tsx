// carouseldeck's bench entry, same shape as the other four decks' entries
// (#340). No CSS import: carouseldeck-app.tsx needs none.
import { createRoot } from 'react-dom/client';
import './style.css';
import { CarouseldeckApp } from './carouseldeck-app';
import { SLIDE_COUNT } from './content';
import { attachHarness, markInitEnd, markInitStart } from './harness';

markInitStart();
attachHarness({
  trackSelector: '[data-bench-slide="0"]',
  dotsSelector: '[data-carouseldeck-dots]',
  slideCount: SLIDE_COUNT
});

createRoot(document.getElementById('app')!).render(<CarouseldeckApp />);
markInitEnd();
