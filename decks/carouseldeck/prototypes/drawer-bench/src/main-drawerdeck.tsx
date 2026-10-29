// THROWAWAY (#245). drawerdeck's bench entry, now the real
// `@drawerdeck/react`, same shape as the other two decks' entries
// (`main-vaul.tsx`, `main-baseui.tsx`).
import { createRoot } from 'react-dom/client';
import './drawerdeck.css';
import './style.css';
import { attachHarness, markInitEnd, markInitStart } from './harness';
import { DrawerdeckApp } from './drawerdeck-app';

markInitStart();
attachHarness({ panelSelector: '#panel' });

createRoot(document.getElementById('app')!).render(<DrawerdeckApp />);
markInitEnd();
