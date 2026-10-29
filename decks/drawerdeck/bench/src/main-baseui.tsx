// Base UI's bench entry.
import { createRoot } from 'react-dom/client';
import './baseui.css';
import './style.css';
import { attachHarness, markInitEnd, markInitStart } from './harness';
import { BaseUiApp } from './baseui-app';

markInitStart();
attachHarness({ panelSelector: '#panel' });

createRoot(document.getElementById('app')!).render(<BaseUiApp />);
markInitEnd();
