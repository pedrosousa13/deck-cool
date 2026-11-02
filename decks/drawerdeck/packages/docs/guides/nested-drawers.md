---
title: Nested drawers
description: 'A drawer opened from inside another just stacks, for free (#272): data-nested-open, --drawer-nested and --drawer-nested-progress for CSS, Escape and the cascade on closing an outer one both handled, no new prop. The inner drawer must be modal.'
---

A `Drawer.Root` rendered from inside another one's `Drawer.Content`, a
"Settings" drawer with a button that opens "Notifications" from inside it,
nests. Nothing new to configure: `side`, `dismissible`, `snapPoints`, a
controlled `open`, all work exactly as documented everywhere else, on every
level. `modal` has one restriction: nesting only supports a modal inner
drawer (see "Modal or non-modal: only the outermost can skip it", below).

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
a descendant of the topmost shown one) makes the drawer behind it inert on
its own: an outside press or Escape never reaches it, and no keyboard focus
can land in it, with no code here at all for either. This holds regardless
of where in the DOM the nested dialog actually lives. `test/nested.test.tsx`
opens one through a React portal, rendered as a sibling of every other
level instead of a descendant of the Panel behind it, in both Chromium and
WebKit, and the behaviour is identical.

A mouse drag is the one exception. With no portal, a nested drawer's own
Panel is a real descendant of the Panel behind it, so a press starting
there still bubbles into the outer's own listener, the same as it always
has: the top layer's inertness only keeps a press from _targeting_ the
outer directly, not from bubbling through it on its way up from something
the outer actually contains. The outer recognizes that press is not its
own and yields (see "Dragging, closing or flicking one never touches
another", below).

**Escape closes only the topmost.** The browser's own close-watcher stack
already delivers a modal dialog's `cancel` event to the topmost one alone.
A non-modal drawer's own `document`-level listener (see "Non-modal
drawers") has no such native ordering, so it checks its own `nestedCount`
before acting on a key press, and yields once that is above zero: a modal
drawer nested above it never touches this listener at all (it yields to
the browser's own close-watcher stack instead), but the key press still
bubbles to `document` regardless, so the count alone is what this listener
reads. Nesting only supports a modal inner drawer, so there is never more
than one non-modal listener on `document` at a time in any one nested
stack, and so no race between two of them to guard against either.

**Dragging, closing or flicking one never touches another.** With no
portal, a nested drawer's own DOM, its Panel, its Viewport, a field
focused inside it, is a real descendant of the Panel behind it, so a
mouse-drag `pointerdown`, a touch, a wheel or a focus move on the inner one
still bubbles (or is read as the active element) into the outer's own
listeners too. Every one of those checks that the event's own target, or
the focused element, belongs to its own dialog: its nearest `dialog`
ancestor is this drawer's own, never one nested inside it, and yields
instead of acting on something that is not actually its own. Never
`stopPropagation()`, which would also hide the press from a consumer's own
listener further up the tree.

## `data-nested-open` and `--drawer-nested`

While a drawer is open somewhere above this one, a direct child, or a
grandchild with nothing open between, `Drawer.Popup` and `Drawer.Panel`
both carry `data-nested-open`, and both also carry `--drawer-nested`, an
integer: how many drawers are currently stacked above it. Both are written
on the Popup and the Panel directly, never left for one to inherit from
the other through the DOM: `data-nested-open` is removed the moment the
last one closes; `--drawer-nested` stays, at `0`, so a CSS rule that reads
it on the frontmost drawer (nothing stacked above it) always finds a real
number there, never a value inherited from a dialog further down the
stack. Set and cleared once per update, never removed and immediately
re-added for the same one.

Both move the moment a drawer nested above this one starts closing, by
any path (a close button, Escape, a drag release, a flick, or a parent's
own cascade), not once it finishes: `--drawer-nested` drops (and
`data-nested-open` clears, once nothing is left) together with that
drawer's own CSS exit starting, so a `transition` reading either, below,
runs at the same time as the exit, not sequentially after it. An
interrupted close (the drawer nested above this one starts closing and
then, before it finishes, is asked to stay open again) reverts on its
own, with no special case: both just go back to describing whatever is
genuinely open above this one once more.

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
instead of sliding.

## `--drawer-nested-progress`: following a drag, not only an open or a close

`--drawer-nested`'s own jump, above, is right for a close button or Escape,
each already its own 300ms CSS transition, but a real drag or swipe on the
drawer directly above this one has no such discrete moment: dragging it
only decides open or closed at release, so a recipe that reads
`--drawer-nested` alone stays at its fully-nested scale for the whole
drag and only moves once the user lets go. `Drawer.Panel` also carries
`--drawer-nested-progress`, the live open progress of the one drawer
directly above it that is currently open or opening (`0` fully closed,
`1` fully open), updated continuously as that drawer is dragged, swiped
or thrown, the same way iOS's own nested sheets and vaul's
`onNestedDrag`/`onNestedOpenChange` do, but with no JS running per drag
frame where the browser supports a named scroll timeline (Chromium,
Safari; see "Why native scrolling"). Interpolate between the fully-open
and fully-closed scales with it, instead of jumping straight to the
fully-open one:

```css
@property --nested-scale {
  syntax: '<number>';
  inherits: false;
  initial-value: 1;
}

.panel {
  --nested-scale: calc(1 - 0.05 * var(--drawer-nested, 0));
  scale: calc(1 - (1 - var(--nested-scale)) * var(--drawer-nested-progress, 0));
  transition:
    transform 300ms ease,
    --nested-scale 300ms ease;
}
```

`--nested-scale` is the fully-nested target for the current count alone,
same as the simpler recipe above, just registered with `@property` now,
and the `transition` reads on it, not on `scale`: `--drawer-nested` flips
the instant the drawer above this one starts or finishes closing (its
own section, above), a plain write with nothing animated about it, so
transitioning `--nested-scale`, which depends only on that count, eases
smoothly between its two target numbers. `scale` then just reads it back
through the same `calc()` either recipe uses, composing it with whatever
`--drawer-nested-progress` is doing that frame: continuous during a drag,
already eased by `--nested-scale`'s own transition otherwise. `scale`
gets no `transition` of its own at all here: read straight off a
`calc()` over `--drawer-nested-progress`, which moves through a native
`animation` wherever a scroll timeline is supported, it would never
start one anyway.

At rest, nothing open above, or something open above and fully settled,
this reads exactly the same as the simpler, `--drawer-nested`-only
recipe above (`--drawer-nested-progress` sits at `1` once the drawer above
has finished opening, and at `0`, written just as directly, once nothing
is open above this one at all). While the drawer directly above this one
is being dragged, it moves continuously in between, and a release that
snaps back open restores it the same way, with no special handling: both
are driven off the same live scroll position a real gesture already
moves.

Only the drawer _directly_ above: a three-level stack's own outermost
level reads the _middle_ one's progress, not the innermost's, the same way
`--drawer-nested`'s own count only ever counts, never tracks which
specific level is moving. Dragging the innermost level of three, the
middle one follows it continuously; the outermost one's own
`--drawer-nested` (`2`, unchanged through the drag) still scales it back
by the fully-nested amount throughout, exactly as it already did.

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

## Modal or non-modal: only the outermost can skip it

Nesting supports a modal inner drawer only: a non-modal `Drawer.Popup` is
a `show()`ed `<dialog>`, never in the browser's own top layer, so nested
it is a plain `position: fixed` element whose containing block is
whatever ancestor sets up a transform or a stacking context -- the Panel
behind it, under the scale-back recipe above, or the resting
`transform: translateY(0)`
("Animate the drawer") -- instead of the viewport. Nested under either,
the inner Panel renders offset from where it should be, and the outer one
gets clipped. Its close cannot cascade cleanly either: nothing here makes
a non-modal drawer's own close wait its turn the way a modal nested
drawer's does.

A non-modal drawer may still be the _outermost_ level, with modal drawers
nested inside it: that drawer has no top layer of its own either way (see
"Non-modal drawers"), and nothing about being the outermost asks it for
one. `Drawer.Root` warns once, with `console.warn`, in development only,
the moment a non-modal drawer opens nested inside another one. Make the
inner drawer modal, or move it to the outermost level, to clear the
warning.

## What vaul, Base UI and React Aria do

**vaul**'s `Drawer.NestedRoot` is a dedicated component (`nested: true`
under the hood), placed inside the outer `Drawer.Root` and reading
`onNestedDrag`/`onNestedOpenChange`/`onNestedRelease` off its context: as
the nested drawer is _dragged_, the outer one's own content element
(`drawerRef.current`, the same node `Drawer.Content` renders, not a
separate background element) scales and translates from the live drag
percentage, in JS, on every drag frame (`vaul` 1.1.2,
`dist/index.mjs:1310-1318`, `onNestedDrag`). `--drawer-nested-progress`,
above, follows the same live drag percentage, but, in keeping with this
engine's native-scrolling rule (see "Why native scrolling"), with no JS
running per drag frame where the browser supports a named scroll timeline:
the inner drawer's own Viewport exposes a second one, lifted to the outer
drawer's own dialog with `timeline-scope`, and an `animation` the outer
drawer sets on its own Panel reads it directly, scoped
(`animation-range`) to the inner drawer's own resting open position.
Where a named scroll timeline is unsupported (Firefox), the inner
drawer's own engine instead reports the same number on a real scroll
frame, mirroring vaul's own per-frame JS exactly, just as a fallback
rather than the only path.

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
