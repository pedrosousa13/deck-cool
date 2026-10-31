# @drawerdeck/core

The framework-neutral engine behind drawerdeck, a headless drawer built on
native scrolling. The sheet sits in a scroll-snap container: the browser
drags, flings and settles it at its snap points, the way it already scrolls
a page. `@drawerdeck/react` builds its React primitives on this engine; use
this package directly for another framework, or to drive the drawer by
hand.

This is a beta: every side (`side`), modal or non-modal (`modal`).

The guides, the reference and the recipes, each with a live demo, are at
[drawer.deck.cool/docs](https://drawer.deck.cool/docs/).

## Install

```sh
pnpm add @drawerdeck/core
```

The package is ESM only.

## Quickstart

```ts
import { createDrawer } from '@drawerdeck/core';

const drawer = createDrawer(
  { dialog, viewport, panel }, // the drawer's DOM nodes; see the docs for their contract
  { snapPoints: [0.5, 1] }
);

drawer.open();
```

`createDrawer` takes the drawer's DOM nodes, already wired up as a native
scroll-snap container, and tracks which snap point the sheet rests at as the
browser scrolls it. `@drawerdeck/react` builds and wires those nodes for you,
as `Drawer.Root`, `Drawer.Trigger`, `Drawer.Popup` and the rest of its parts:
use this package directly only to drive the drawer from another framework.

## License

MIT
