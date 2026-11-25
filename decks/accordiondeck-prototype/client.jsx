import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './app.jsx';

const ctl = (window.__ctl = { calls: [], decline: false, naive: false, buttonClicks: 0, errors: [] });
const el = () => document.getElementById('root');
window.mountClient = (opts) => {
  Object.assign(ctl, opts.ctl);
  createRoot(el()).render(<App variant={opts.variant} ctl={ctl} initial={opts.initial} />);
};
window.hydrate = (opts) => {
  Object.assign(ctl, opts.ctl);
  hydrateRoot(el(), <App variant={opts.variant} ctl={ctl} initial={opts.initial} />, {
    onRecoverableError: (e) => ctl.errors.push('recoverable: ' + e.message.slice(0, 120)),
  });
};
