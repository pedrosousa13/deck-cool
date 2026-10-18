---
title: Install
description: 'Install @carouseldeck/react with one command. React and React DOM 19 are its peer dependencies, it brings the @carouseldeck/core engine, and it is ESM only.'
---

```sh
pnpm add @carouseldeck/react
```

`react` and `react-dom` 19 are peer dependencies. `@carouseldeck/react` is the
only package to install. It brings `@carouseldeck/core`, the engine, with it. The
package is ESM only.

On React 18, or where a dependency needs to run on React 18 and 19 from one
build, install `@carouseldeck/react-18` instead, and import from it the same
way. `@carouseldeck/react` stays the package for an app on React 19 alone.
