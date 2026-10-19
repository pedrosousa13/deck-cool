import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/storybook-static/**',
      '**/.next/**',
      'playwright-report/**',
      'test-results/**',
      // Gitignored, but flat config does not read .gitignore, so without this
      // the scratch files a session writes are linted as project source.
      '.scratch/**',
      // Gitignored output of the throwaway prototype's measure suite (#3).
      'prototypes/scroll-snap/measure-results/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts}'],
    languageOptions: { globals: globals.node }
  },
  {
    // The Next.js server components fixture, tests/next-rsc, is plain JSX.
    files: ['tests/next-rsc/**/*.jsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules
  },
  {
    // The viewport-bleed prototype's probes (#188) are plain Node scripts
    // that pass a callback to Playwright's `page.evaluate` or
    // `page.waitForFunction`, which runs it in the browser it drives, not
    // here: that callback's own globals (`document`, `window`) need
    // declaring too.
    files: ['prototypes/viewport-bleed/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules
  }
);
