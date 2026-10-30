// @drawerdeck/react's source, built for React 18. The source is written for
// React 19 and is not changed for this build, so the React 19 package ships
// none of it: here `react` resolves to the shim in src/react.ts, and each
// component the source exports takes `ref` through forwardRef. The
// automatic JSX runtime needs no shim: the source renders no host element
// that React 18 and 19 treat differently.
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const source = here('../react/src/');
const reactShim = here('src/react.ts');
const withRef = here('src/with-ref.ts');

/** The source's import of `react` resolves to the shim; the shim's own, and
 * withRef's, resolve to React. */
const reactShims: Plugin = {
  name: 'drawerdeck-react-18-shims',
  enforce: 'pre',
  resolveId(id, importer) {
    if (importer?.startsWith(source) && id === 'react') return reactShim;
    return null;
  }
};

/** Every component in the source, a capitalised top-level `function`,
 * renamed and declared again through withRef under its own name, exported
 * where it was. The source's own references then reach the wrapped
 * component, as a consumer's do: Trigger passes its `ref` on to the button
 * it renders. */
const forwardRefs: Plugin = {
  name: 'drawerdeck-react-18-forward-refs',
  enforce: 'pre',
  transform(code, id) {
    if (id !== `${source}index.tsx`) return null;
    const components: { name: string; exported: boolean }[] = [];
    const renamed = code.replace(
      /^(export )?function ([A-Z]\w*)\(/gm,
      (_, exported: string | undefined, name: string) => {
        components.push({ name, exported: exported !== undefined });
        return `function ${name}$render(`;
      }
    );
    const names = components.map(({ name }) => name);
    if (!names.includes('Root') || !names.includes('Viewport')) {
      throw new Error('The React 18 build found no Root or Viewport to wrap.');
    }
    const wrapped = components
      .map(
        ({ name, exported }) =>
          `${exported ? 'export ' : ''}const ${name} = withRef(${name}$render, '${name}');`
      )
      .join('\n');
    return `import { withRef } from ${JSON.stringify(withRef)};\n${renamed}\n${wrapped}\n`;
  }
};

export default defineConfig({
  plugins: [
    reactShims,
    forwardRefs,
    {
      // The source's declarations: the API is the same. React 18's own
      // types check them in test/consumer.tsx.
      name: 'drawerdeck-react-18-files',
      apply: 'build',
      closeBundle() {
        mkdirSync(here('dist'), { recursive: true });
        copyFileSync(here('../react/dist/index.d.ts'), here('dist/index.d.ts'));
      }
    }
  ],
  build: {
    lib: {
      entry: {
        index: `${source}index.tsx`,
        // Not in package.json's `exports`, so no consumer can import it: the
        // workspace's own vitest configs alias it, to read the React
        // version this build's dist itself saw.
        'react-version': here('src/react-version.ts')
      },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`
    },
    rollupOptions: {
      // React is external everywhere but in the source, which gets the
      // shim. The automatic JSX transform imports `react/jsx-runtime`
      // straight from the source, unshimmed: always external.
      external: (id, importer) =>
        id === '@drawerdeck/core' ||
        id === 'react-dom' ||
        id === 'react/jsx-runtime' ||
        (id === 'react' && !importer?.startsWith(source)),
      output: {
        // The built module is client code, as @drawerdeck/react's is.
        banner: "'use client';",
        chunkFileNames: '[name].js'
      }
    },
    sourcemap: false
  }
});
