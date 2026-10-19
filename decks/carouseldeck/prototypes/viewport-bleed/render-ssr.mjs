// Question 5: does the server HTML under the bleed recipe need any
// JavaScript to lay out correctly? Renders the real
// `packages/react/src/index.tsx` (the package's own source, not a build)
// server-side with Vite's SSR module runner, wraps the markup in the bleed
// CSS, and writes `ssr.html` beside this file (gitignored; regenerate it
// with this script).
//
// Run from decks/carouseldeck:
//   node prototypes/viewport-bleed/render-ssr.mjs

import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const root = fileURLToPath(new URL('../../', import.meta.url));

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: 'custom',
  resolve: {
    alias: [
      {
        find: /^@carouseldeck\/core$/,
        replacement: fileURLToPath(
          new URL('../../packages/core/src/index.ts', import.meta.url)
        )
      },
      {
        find: /^@carouseldeck\/react$/,
        replacement: fileURLToPath(
          new URL('../../packages/react/src/index.tsx', import.meta.url)
        )
      }
    ]
  }
});

const { Root, Viewport, Slide, Prev, Next, Dots } = await server.ssrLoadModule(
  fileURLToPath(new URL('../../packages/react/src/index.tsx', import.meta.url))
);
// Plain npm packages, not the aliased carouseldeck source: Node imports
// them directly, so Vite's SSR module runner never has to decide whether
// to externalize them.
const React = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');

const slides = Array.from({ length: 6 }, (_, i) =>
  React.createElement(
    Slide,
    { key: i, className: 'slide' },
    React.createElement('p', null, `Slide ${i + 1}`)
  )
);

const markup = renderToStaticMarkup(
  React.createElement(
    Root,
    { 'aria-label': 'Featured slides', defaultIndex: 0 },
    React.createElement(Viewport, { className: 'viewport' }, slides),
    React.createElement(Prev),
    React.createElement(Next),
    React.createElement(Dots)
  )
);

const css = `
  body { margin: 0; }
  .page { width: 100%; container-type: inline-size; }
  .column { width: 400px; margin-inline: auto; outline: 1px dashed #999; }
  .column .viewport {
    --inset: calc((100cqi - 400px) / 2);
    margin-inline: calc(-1 * var(--inset));
    padding-inline: var(--inset);
    scroll-padding-inline: var(--inset);
  }
  .slide {
    width: calc((100% - 2 * 16px) / 2.5);
    scroll-snap-align: start;
    background: #eef;
    flex-shrink: 0;
  }
  .viewport { display: flex; gap: 16px; overflow-x: auto; }
`;

const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${css}</style></head>
<body><div class="page"><div class="column">${markup}</div></div></body></html>`;

writeFileSync(new URL('./ssr.html', import.meta.url), html);
console.log('wrote ssr.html, markup length', markup.length);

await server.close();
