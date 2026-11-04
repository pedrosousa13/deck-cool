// Generates every mount-scenario static page (#340), after `vite build`
// (the client bundles, including each `mount-<deck>.client.js`, fixed-name
// per vite.config.ts) and `vite build -c vite.ssr.config.ts` (each deck's
// `dist-ssr/<deck>.mjs`, exporting `renderMarkup(n, dirty)`) have both run
// -- `package.json`'s own `build` script chains these three steps in order.
//
// One page per (deck, n, dirty, mode) cell: `mount.spec.ts`'s own `mountUrl`
// repeats this exact filename convention,
// `mount-<deck>-n<n>-<dirty ? 'dirty' : 'clean'>-<mode>.html`, so a change
// here needs the matching change there. The `-ssr.html` variant's `#root`
// carries `renderMarkup`'s own output (and `data-ssr="1"`, which
// `client-entry-<deck>.tsx` reads to decide `hydrateRoot` over `createRoot`);
// the `-csr.html` variant's `#root` is empty. Both carry the same inline
// `window.__mountConfig` script, placed before the module script tag so it
// runs first (a classic inline script executes where it's parsed; a
// `type="module"` script is deferred to after parsing either way).
//
// Written into `dist/`, alongside the client build's own output, so
// `vite preview` serves every generated page from the same origin with no
// extra server configuration.
//
// `vite.config.ts` turns on `build.manifest` for exactly this: unlike
// `bench-<deck>.html`, which Vite rewrites as a real HTML entry and links
// its CSS into automatically, these pages are written after that build
// runs, so nothing links a deck's CSS (Embla's and Keen's own positioning
// recipe, Swiper's and Splide's base stylesheet) into them unless this
// script does it, from the manifest's own `css` list -- found by walking
// each mount entry's `imports` (a manifest entry's own `css` lives on the
// *chunk* that pulled the stylesheet in, not on the entry that imports that
// chunk; found the hard way, by a mount page missing Embla's positioning
// CSS silently collapsing every snap point into one -- see the git history
// here for the full diagnosis). Found empirically this does not recurse
// past one level for any deck here, but it walks every level anyway rather
// than assume that stays true.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const DECK_KEYS = ['carouseldeck', 'embla', 'keen', 'swiper', 'splide'];
const N_VALUES = [2, 20];
const DIRTY_VALUES = [false, true];

const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
mkdirSync(distDir, { recursive: true });

const manifest = JSON.parse(
  readFileSync(new URL('../dist/.vite/manifest.json', import.meta.url), 'utf8')
);

/** Every CSS file a manifest entry pulls in, directly or through a chunk it
 * imports, deduplicated. */
function cssFor(entryKey, seen = new Set()) {
  if (seen.has(entryKey)) return [];
  seen.add(entryKey);
  const entry = manifest[entryKey];
  if (!entry) return [];
  const own = entry.css ?? [];
  const fromImports = (entry.imports ?? []).flatMap((key) => cssFor(key, seen));
  return [...own, ...fromImports];
}

function page({ title, bodyRoot, clientScript, cssFiles, config }) {
  const links = cssFiles
    .map((href) => `    <link rel="stylesheet" href="./${href}" />`)
    .join('\n');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${title}</title>
${links ? `${links}\n` : ''}  </head>
  <body>
    ${bodyRoot}
    <script>window.__mountConfig = ${JSON.stringify(config)};</script>
    <script type="module" src="./${clientScript}"></script>
  </body>
</html>
`;
}

for (const key of DECK_KEYS) {
  const ssrModuleUrl = new URL(`../dist-ssr/${key}.mjs`, import.meta.url);
  const { renderMarkup } = await import(ssrModuleUrl);
  const clientScript = `mount-${key}.client.js`;
  const cssFiles = [...new Set(cssFor(`src/mount/client-entry-${key}.tsx`))];

  for (const n of N_VALUES) {
    for (const dirty of DIRTY_VALUES) {
      const variant = dirty ? 'dirty' : 'clean';
      const config = { n, dirty };
      const title = `${key} mount n=${n} ${variant} | carousel bench (#340)`;

      const markup = renderMarkup(n, dirty);
      writeFileSync(
        `${distDir}mount-${key}-n${n}-${variant}-ssr.html`,
        page({
          title,
          bodyRoot: `<div id="root" data-ssr="1">${markup}</div>`,
          clientScript,
          cssFiles,
          config
        })
      );

      writeFileSync(
        `${distDir}mount-${key}-n${n}-${variant}-csr.html`,
        page({
          title,
          bodyRoot: '<div id="root"></div>',
          clientScript,
          cssFiles,
          config
        })
      );
    }
  }
}

console.log(
  `Wrote ${DECK_KEYS.length * N_VALUES.length * DIRTY_VALUES.length * 2} mount pages to ${distDir}`
);
