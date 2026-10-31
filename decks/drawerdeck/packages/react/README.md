# @drawerdeck/react

A headless drawer for React 19, built on native scrolling.
The sheet sits in a scroll-snap container: the browser drags, flings and
settles it at its snap points, the way it already scrolls a page.
`Drawer.Popup` renders a `<dialog>`, modal by default (the top layer, focus
trapping, an inert page behind it and Escape, with no portal to manage), or
non-modal with `modal={false}`. You
compose the drawer from parts that need no stylesheet, and style it with
plain CSS.

This is a beta: every side (`side`), modal or non-modal (`modal`).

The guides, the reference and the recipes, each with a live demo, are at
[drawer.deck.cool/docs](https://drawer.deck.cool/docs/).

## Install

```sh
pnpm add @drawerdeck/react
```

`react` and `react-dom` 19 are peer dependencies. `@drawerdeck/react` is the
only package to install. It brings `@drawerdeck/core`, the engine, with it.
The package is ESM only.

## Quickstart

```tsx
import * as Drawer from '@drawerdeck/react';

export function Settings() {
  return (
    <Drawer.Root>
      <Drawer.Trigger>Open</Drawer.Trigger>
      <Drawer.Popup>
        <Drawer.Backdrop />
        <Drawer.Viewport>
          <Drawer.Panel>
            <Drawer.Handle />
            <Drawer.Title>Settings</Drawer.Title>
            <Drawer.Content>…</Drawer.Content>
            <Drawer.Close>Done</Drawer.Close>
          </Drawer.Panel>
        </Drawer.Viewport>
      </Drawer.Popup>
    </Drawer.Root>
  );
}
```

With no `snapPoints`, the drawer has one open point: the panel shown at its
content height, capped by its own CSS `max-height`. `Drawer.Popup` renders
the `<dialog>` on the top layer, so it needs no portal.

## License

MIT
