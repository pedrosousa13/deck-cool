// vaul's bench entry.
import { createRoot } from 'react-dom/client';
import './vaul-vendor.css';
import './vaul.css';
import './style.css';
import { attachHarness, markInitEnd, markInitStart } from './harness';
import { VaulApp } from './vaul-app';

markInitStart();
attachHarness({ panelSelector: '#panel' });

createRoot(document.getElementById('app')!).render(<VaulApp />);
markInitEnd();
