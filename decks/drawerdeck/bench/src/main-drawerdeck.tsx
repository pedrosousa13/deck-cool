// drawerdeck's bench entry, same shape as the other three decks' entries.
import { createRoot } from 'react-dom/client';
import './drawerdeck.css';
import './style.css';
import { attachHarness, markInitEnd, markInitStart } from './harness';
import { DrawerdeckApp } from './drawerdeck-app';

markInitStart();
attachHarness({ panelSelector: '#panel' });

createRoot(document.getElementById('app')!).render(<DrawerdeckApp />);
markInitEnd();
