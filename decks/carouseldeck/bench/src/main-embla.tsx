// Embla's bench entry, same shape as the other four decks' entries (#340).
import { createRoot } from 'react-dom/client';
import './embla.css';
import './style.css';
import { SLIDE_COUNT } from './content';
import { EmblaApp } from './embla-app';
import { attachHarness, markInitEnd, markInitStart } from './harness';

markInitStart();
attachHarness({
  trackSelector: '[data-bench-slide="0"]',
  dotsSelector: '[data-bench-dots]',
  slideCount: SLIDE_COUNT
});

createRoot(document.getElementById('app')!).render(<EmblaApp />);
markInitEnd();
