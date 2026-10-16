// @carouseldeck/react's source, built for React 18. The source is written for
// React 19 and is not changed for this build, so the React 19 package ships
// none of it: here `react` and `react/jsx-runtime` resolve to the shims in
// src, and each component the source exports takes `ref` through
// forwardRef. No `react-server` entry: React 18 has no server components.
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const source = here('../react/src/');
const shims: Record<string, string> = {
  react: here('src/react.ts'),
  'react/jsx-runtime': here('src/jsx-runtime.ts')
};
const withRef = here('src/with-ref.ts');

/** The source's imports of React resolve to the shims; the shims' own, and
 * withRef's, resolve to React. */
const reactShims: Plugin = {
  name: 'carouseldeck-react-18-shims',
  enforce: 'pre',
  resolveId(id, importer) {
    if (importer?.startsWith(source) && id in shims) return shims[id];
    return null;
  }
};

/** Every component in the source, a capitalised top-level `function`,
 * renamed and declared again through withRef under its own name, exported
 * where it was. The source's own references then reach the wrapped
 * component, as a consumer's do: Root recognises the Viewport a consumer
 * renders, and Prev passes its `ref` on to the button it renders. */
const forwardRefs: Plugin = {
  name: 'carouseldeck-react-18-forward-refs',
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
      // The source's declarations: the API is the same. React 18's own types
      // check them in test/types.test.tsx.
      name: 'carouseldeck-react-18-files',
      apply: 'build',
      closeBundle() {
        mkdirSync(here('dist'), { recursive: true });
        for (const file of [
          'index.d.ts',
          'fade.d.ts',
          'curve.d.ts',
          'stack.d.ts'
        ]) {
          copyFileSync(here(`../react/dist/${file}`), here(`dist/${file}`));
        }
        copyFileSync(`${source}theme.css`, here('dist/theme.css'));
      }
    }
  ],
  build: {
    lib: {
      entry: {
        index: `${source}index.tsx`,
        fade: `${source}fade.ts`,
        curve: `${source}curve.ts`,
        stack: `${source}stack.ts`
      },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`
    },
    rollupOptions: {
      // React is external everywhere but in the source, which gets the shims.
      external: (id, importer) =>
        id === '@carouseldeck/core' ||
        id === 'react-dom' ||
        (id in shims && !importer?.startsWith(source)),
      output: {
        // Every module is client code, as in @carouseldeck/react.
        banner: "'use client';",
        chunkFileNames: '[name].js'
      }
    },
    sourcemap: false
  }
});
