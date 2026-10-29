---
title: Install
description: 'Install @drawerdeck/react with one command. React and React DOM 19 are its peer dependencies, it brings the @drawerdeck/core engine, and it is ESM only.'
---

```sh
pnpm add @drawerdeck/react
```

`react` and `react-dom` 19 are peer dependencies. `@drawerdeck/react` is the
only package to install: it brings `@drawerdeck/core`, the engine, with it.
The package is ESM only.

On React 18, or where a dependency needs to run on React 18 and 19 from one
build, install `@drawerdeck/react-18` instead, and import from it the same
way. `@drawerdeck/react` stays the package for an app on React 19 alone.

Both packages are placeholders while the beta is built (#240): installing
either one today gets a `version` export and nothing else.
