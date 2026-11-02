---
title: Nested drawers
description: 'A drawer opened from inside another just stacks, for free (#272): data-nested-open and --drawer-nested for CSS, Escape and the cascade on closing an outer one both handled, no new prop.'
---

A `Drawer.Root` rendered from inside another one's `Drawer.Content`, a
"Settings" drawer with a button that opens "Notifications" from inside it,
nests. Nothing new to configure: `side`, `modal`, `dismissible`,
`snapPoints`, a controlled `open`, all work exactly as documented
everywhere else, on every level.

```tsx
<Drawer.Root>
  <Drawer.Trigger>Open Settings</Drawer.Trigger>
  <Drawer.Popup>
    <Drawer.Viewport>
      <Drawer.Panel>
        <Drawer.Title>Settings</Drawer.Title>
        <Drawer.Content>
          {/* A second Drawer.Root, right here, is nested. */}
          <Drawer.Root>
            <Drawer.Trigger>Open Notifications</Drawer.Trigger>
            <Drawer.Popup>
              <Drawer.Viewport>
                <Drawer.Panel>
                  <Drawer.Title>Notifications</Drawer.Title>
                  <Drawer.Content>…</Drawer.Content>
                  <Drawer.Close>Close</Drawer.Close>
                </Drawer.Panel>
              </Drawer.Viewport>
            </Drawer.Popup>
          </Drawer.Root>
        </Drawer.Content>
        <Drawer.Close>Close</Drawer.Close>
      </Drawer.Panel>
    </Drawer.Viewport>
  </Drawer.Popup>
</Drawer.Root>
```

<!-- demo:example-nested -->

Three levels, each opened from inside the one before it. Open Settings,
then Notifications, then Advanced; drag, close or press Escape on any one
and only that level moves.

## What stacking costs: nothing

Each level is its own `<dialog>`. Opening one with `showModal()` puts it in
the browser's own top layer, above whatever was already there, and the
browser's own rule for "blocked by a modal dialog" (any node that is not
a descendant of the topmost shown one) makes the drawer behind it inert
on its own: no pointer event reaches it, no keyboard focus can land in it,
with no code here at all. This holds regardless of where in the DOM the
nested dialog actually lives. `test/nested.test.tsx` opens one through a
React portal, rendered as a sibling of every other level instead of a
descendant of the Panel behind it, in both Chromium and WebKit, and the
behaviour is identical.

**Escape closes only the topmost.** The browser's own close-watcher stack
already delivers a modal dialog's `cancel` event to the topmost one alone.
A non-modal drawer's own `document`-level listener (see "Non-modal
drawers") has no such native ordering, so the engine checks two things
before acting on a key press: its own `nestedCount`, and a marker shared
across every non-modal listener on the one `document`, set the moment any
of them actually closes for this exact key press. Either one finding
something already spoken for is enough to yield. The marker alone is not
enough on its own: a modal drawer nested above a non-modal one never sets
it (it yields to the browser's own close-watcher stack instead), and a
non-modal child mounted after its parent already opened registers its own
listener after the parent's, so it is not guaranteed to run, and set the
marker, first.

**Dragging, closing or flicking one never touches another.** With no
portal, a nested drawer's own Panel is a real DOM descendant of the Panel
behind it, so a mouse-drag `pointerdown` on the inner one would otherwise
keep bubbling straight into the outer Panel's own listener too. The engine
stops it there.

## `data-nested-open` and `--drawer-nested`

While a drawer is open somewhere above this one, a direct child, or a
grandchild with nothing open between, `Drawer.Popup` and `Drawer.Panel`
both carry `data-nested-open`, and `Drawer.Popup` carries `--drawer-nested`,
an integer: how many drawers are currently stacked above it. `data-nested-open`
is removed the moment the last one closes; `--drawer-nested` stays, at `0`,
so a CSS rule that reads it on the frontmost drawer (nothing stacked above
it) always finds a real number there, never a value inherited from a
dialog further down the stack through the DOM. Set and cleared per
open/close event, never per scroll frame or drag frame, the same as every
other data attribute here.

```css
.panel[data-nested-open] {
  /* dim or otherwise de-emphasize this one's own content */
}

.panel {
  scale: calc(1 - 0.05 * var(--drawer-nested, 0));
  transition:
    transform 300ms ease,
    scale 300ms ease;
}
```

`scale` is a standalone CSS property, not folded into `transform`, so the
computed style composes with the Panel's own entrance/exit `transform`
("Animate the drawer") with no conflict. Its `transition` is a separate
matter: list `transform` explicitly alongside `scale`, as above, or a rule
that only names `scale` overrides the Panel's own `transition: transform
...` from the entrance/exit recipe wherever it has higher specificity or
comes later in the sheet, and the Panel's entrance and exit then jump
instead of sliding. The demo above uses exactly this recipe, with both
properties named.

## Closing an outer drawer while an inner one is open

The only way this actually happens is the controlled-component contract:
something outside the drawer tree sets a controlling `open` false while a
drawer nested inside it is still open (a real press can't reach the outer
one directly, since it's inert, above). `@drawerdeck/react` closes the
inner one first, waits for it to actually finish, then closes the outer
one; each reports its own reason (`Drawer.Root`'s own `onOpenChange`),
never a shared one. Sequentially, not together: the inner's own native
`close()`, mid-flight, restores focus to whatever had it before that
drawer opened, but only if focus is currently inside it, which, with no
portal, the outer's own close would also see as true, since the inner
dialog is a DOM descendant of the outer one. Closing both at once risks
the outer's own native restoration firing while the inner is still
genuinely open and modal, moving focus out from under its own focus trap.
Closing the inner first removes that dialog, and the risk, before the
outer's own close ever starts.

Focus then lands exactly where it already does for any drawer, nested or
not: on the inner's own `Drawer.Trigger`, the button inside the outer
drawer that opened it, the moment it finishes closing, and on the outer
drawer's own `Drawer.Trigger` once it, in turn, finishes.

## Finding the relationship: context, not a prop and not `@drawerdeck/core`

A nested `Drawer.Root` finds the nearest enclosing one through context,
the same way Base UI's own `Drawer` does (`useDrawerRootContext(true)`,
read optionally, and a `notifyParent*` family of callbacks a nested root
is handed, though drawerdeck's own version needs a smaller one, since its
CSS recipe above needs only a depth count and a close, not swipe progress
or a frontmost height). `@drawerdeck/core` itself is handed the result,
not the relationship: a plain `nestedCount` number, fed in through
`setOptions` the same way `snapPoints`/`dismissible`/`modal` already are.
The engine renders it and reads it; it never discovers a parent on its
own, by a DOM walk or otherwise. No `parent` prop exists, and none is
needed for the one shape `@drawerdeck/react` renders a nested `Drawer.Root`
in today.

## Modal or non-modal, either nests

Nesting itself, the count, the attributes, the close cascade, Escape
closing only the topmost, works the same whether every level is modal,
every level is non-modal, or a mix. What a non-modal level does not get is
the browser's own top layer or its automatic inertness: a non-modal
drawer never had those even on its own (see "Non-modal drawers"), and
nesting does not add them. Two non-modal levels stack visually by plain
DOM paint order (the inner is a later sibling in spirit, so it paints over
the outer), and the same `clip-path` hit area each already has clips its
own Viewport to its own Panel, but neither gets a focus trap, nested or
not. Reach for modal where a real focus trap, on every level, matters more
than an interactive page behind the whole stack.

## What vaul, Base UI and React Aria do

**vaul**'s `Drawer.NestedRoot` is a dedicated component (`nested: true`
under the hood), placed inside the outer `Drawer.Root` and reading
`onNestedDrag`/`onNestedOpenChange`/`onNestedRelease` off its context: as
the nested drawer is _dragged_, the outer one's own content element
(`drawerRef.current`, the same node `Drawer.Content` renders, not a
separate background element) scales and translates from the live drag
percentage, in JS, on every drag frame (`vaul` 1.1.2,
`dist/index.mjs:1310-1318`, `onNestedDrag`). drawerdeck's `--drawer-nested`
recipe, above, only ever changes on an open or a close event, never a drag
frame, in keeping with this engine's native-scrolling rule (see "Why
native scrolling").

**Base UI**'s `Drawer` ships the closest match: `data-nested-drawer-open`
and `--nested-drawers`, read from a `DrawerPopupDataAttributes`/
`DrawerPopupCssVars` pair documented in its own "Nested drawers" section,
with the same "style when something is open above this one" shape
drawerdeck's `data-nested-open`/`--drawer-nested` follow. `--nested-drawers`
is documented only as "the number of nested drawers that are currently
open" (`@base-ui/react` 1.9.0, `DrawerPopupCssVars.nestedDrawers`), with no
stated ordering. Both ship a `Drawer.Portal` for a nested example, so each
dialog is a sibling in the DOM, not a descendant; drawerdeck's own
`@drawerdeck/react` needs none, since `Drawer.Popup` renders wherever its
own `Drawer.Root` does and the top layer does not care where that is.

**React Aria**'s `Sheet` stacks by nesting one `SheetTrigger` (and its own
`Sheet`) inside another, exposing `data-stack-index` and
`data-has-descendants`. In `react-aria-components` 1.22.1
(`dist/private/Sheet.mjs`), `stackIndex` is a sheet's own index in a
module-level stack that every open `Sheet` appends itself to in open
order, and `descendants` is `sheetStack.slice(index + 1)`: index `0` is
the first sheet opened, the backmost, not the frontmost, and the highest
index is whichever opened last and so sits on top. A `stackAnimation` prop
names a CSS `@keyframes` the parent sheet runs while a child is open:
closer in spirit to drawerdeck's own CSS-only recipe than vaul's JS-driven
one, though keyed to a named animation rather than a live custom property
a consumer's own `calc()` can read directly.
