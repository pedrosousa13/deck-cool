// @accordiondeck/react's source, built for React 18. The source is written
// for React 19 and is not changed for this build. It uses one React 19-only
// API: `ref` as a prop. Here each component the source exports takes it
// through forwardRef (src/with-ref.ts, the same as @drawerdeck/react-18's).
// The source calls no other React 19-only API, so `react` needs no shim.
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const source = here('../react/src/');
const withRef = here('src/with-ref.ts');

/** Every component in the source, a capitalised top-level `function`,
 * renamed and declared again through withRef under its own name, exported
 * where it was. The source's own references then reach the wrapped
 * component, as a consumer's do. */
const forwardRefs: Plugin = {
  name: 'accordiondeck-react-18-forward-refs',
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
    for (const part of ['Item', 'Trigger', 'Panel']) {
      if (!names.includes(part)) {
        throw new Error(`The React 18 build found no ${part} to wrap.`);
      }
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
    forwardRefs,
    {
      // The source's declarations: the API is the same.
      name: 'accordiondeck-react-18-files',
      apply: 'build',
      closeBundle() {
        mkdirSync(here('dist'), { recursive: true });
        copyFileSync(here('../react/dist/index.d.ts'), here('dist/index.d.ts'));
      }
    }
  ],
  build: {
    lib: {
      entry: { index: `${source}index.tsx` },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`
    },
    rollupOptions: {
      external: (id) =>
        id === 'react' || id.startsWith('react/') || id === 'react-dom',
      output: {
        // The built module is client code, as @accordiondeck/react's is.
        banner: "'use client';",
        chunkFileNames: '[name].js'
      }
    },
    sourcemap: false
  }
});
