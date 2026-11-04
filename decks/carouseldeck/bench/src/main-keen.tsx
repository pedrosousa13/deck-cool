// Keen's bench entry, same shape as the other four decks' entries (#340).
// No `keen.css`: keen-app.tsx needs none beyond the package's own
// stylesheet, imported there.
import { createRoot } from 'react-dom/client';
import './style.css';
import { SLIDE_COUNT } from './content';
import { attachHarness, markInitEnd, markInitStart } from './harness';
import { KeenApp } from './keen-app';

markInitStart();
attachHarness({
  trackSelector: '[data-bench-slide="0"]',
  dotsSelector: '[data-bench-dots]',
  slideCount: SLIDE_COUNT
});

createRoot(document.getElementById('app')!).render(<KeenApp />);
markInitEnd();
