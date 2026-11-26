# @drawerdeck/react-18

## 0.1.0-beta.2

### Minor Changes

- 0d618e0: Everything since `0.1.0-beta.1`:

  - `Drawer.Root` takes a `side` prop (`'bottom' | 'top' | 'left' | 'right'`, default `'bottom'`), so a drawer can open from any edge, not only the bottom.
  - `Drawer.Root` takes a `modal` prop (default `true`). A non-modal drawer (`modal={false}`) leaves the page live underneath it: no `showModal()`, and only its own Panel blocks pointer input, so the rest of the page stays clickable and scrollable around it.
  - A drawer opened from inside another one's `Drawer.Content` now nests: each stacks on its own `<dialog>`, Escape and an outside press close only the top one, and a non-modal drawer yields Escape to a modal drawer nested above it.
  - `Drawer.Root` takes an `indent` prop: a ref to an element outside the dialog that eases into an indented, scaled-down state while the drawer is open, the way iOS's own sheets indent the page behind them. Opt-in, and ignored on a nested `Drawer.Root`.
  - The drawer now opens and closes with the consumer's own CSS transition on `transform` (`data-starting-style`/`data-ending-style` on the Panel and Backdrop), instead of a native scroll animation. See the "Animate the drawer" guide for the recipe.
  - A flicked drawer now closes as soon as its Panel leaves view, instead of waiting for the browser's scroll gesture to fully settle.
  - A mouse drag released past the drawer's closed position, outside the Viewport, no longer reopens it.
  - The drawer now keeps a focused field clear of the on-screen keyboard: it tracks how much of the layout viewport the keyboard covers and expands to its largest snap point while a field inside it is focused, instead of leaving the field hidden under the keyboard.
  - On touch WebKit, focusing a field inside the drawer no longer lets Safari pan the page to reveal the keyboard with the field already hidden under it; focus now takes over before that pan starts, and the drawer gives the field room instead of letting a stray pan leave it covered.

### Patch Changes

- Updated dependencies [0d618e0]
- Updated dependencies [41e8863]
- Updated dependencies [20b8196]
  - @drawerdeck/core@0.1.0-beta.2
