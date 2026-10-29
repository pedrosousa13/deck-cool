#!/usr/bin/env node
// Min+gzip per drawer (#266, #283), by the same method carouseldeck's own
// scroll-snap bench uses (an in-memory Vite build, minified, gzipped, every
// JS chunk plus any stylesheet the entry imports): applied to each deck's
// own bench entry, so the figure is what that deck's page actually ships.
// All four are React entries, each measured with `react`, `react-dom` and
// `react/jsx-runtime` external (so the number is the drawer's size, not
// React's) -- for React Aria's Sheet, nothing else is externalized, so the
// figure is its full import cost: Modal, overlays and focus management,
// everything `Sheet` pulls in, the way a consumer actually ships it (#283's
// brief).

import { fileURLToPath, URL } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('.', import.meta.url));

const reactExternal = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime'
];

const entries = [
  {
    deck: 'drawerdeck',
    entry: 'src/main-drawerdeck.tsx',
    external: reactExternal
  },
  { deck: 'vaul', entry: 'src/main-vaul.tsx', external: reactExternal },
  { deck: 'baseui', entry: 'src/main-baseui.tsx', external: reactExternal },
  {
    deck: 'reactaria',
    entry: 'src/main-reactaria.tsx',
    external: reactExternal
  }
];

/** @param {string} entry @param {string[]} external */
async function measure(entry, external) {
  const { build } = await import('vite');
  const react = (await import('@vitejs/plugin-react')).default;
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    root,
    plugins: [react()],
    build: {
      write: false,
      sourcemap: false,
      rolldownOptions: {
        input: `${root}/${entry}`,
        external
      }
    }
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(
    (bundle) => ('output' in bundle ? bundle.output : [])
  );
  return outputs.reduce((sum, item) => {
    if (item.type === 'chunk') return sum + gzipSync(item.code).length;
    if (item.fileName.endsWith('.css'))
      return sum + gzipSync(item.source).length;
    return sum;
  }, 0);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(2)} KB`;

const main = async () => {
  const rows = [];
  for (const { deck, entry, external } of entries) {
    const bytes = await measure(entry, external);
    rows.push({ deck, bytes, external });
    console.log(`${deck.padEnd(12)} ${kb(bytes)}  (react external)`);
  }
  console.log('\nJSON:', JSON.stringify(rows));
};

await main();
