// React Aria Sheet's bench entry (#283).
import { createRoot } from 'react-dom/client';
import './reactaria.css';
import './style.css';
import { attachHarness, markInitEnd, markInitStart } from './harness';
import { ReactAriaApp } from './reactaria-app';

markInitStart();
attachHarness({ panelSelector: '#panel' });

createRoot(document.getElementById('app')!).render(<ReactAriaApp />);
markInitEnd();
