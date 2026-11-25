# `<details>` is the engine, gated by a prototype

Accordiondeck is a headless accordion and collapsible for React built on
`<details>` and `<summary>`. Radix, Base UI, React Aria, Headless UI and Ark
all render a heading, a button and a div, and none uses `<details>` (their
npm tarballs, checked 2026-11-25). Each measures the panel into a CSS
variable to animate its height (`--radix-accordion-content-height`,
`--accordion-panel-height`, `--disclosure-panel-height`). Accordiondeck
exists for what only the native element gives:

- **It opens and closes before hydration.** `<details name>` keeps a group
  to one open item with no JavaScript: Chrome 120, Firefox 130, Safari 17.2.
- **Find-in-page and fragment links open a closed item by default**, with
  no JavaScript. Base UI (`hiddenUntilFound`) and React Aria do this after
  hydration, and Radix does not do it at all. Safari 26.2 opens the item
  but does not scroll to the match (webkit.org/b/304174).
- **The height animates without measuring.** `::details-content` with
  `interpolate-size: allow-keywords` animates open and close in Chrome.
  Safari and Firefox do not support `interpolate-size` yet, so there the
  item opens and closes at once, with no JavaScript fallback.

Bundle size is an aim, not a gate, as in carouseldeck's ADR 0001. It is
measured as `decks/carouseldeck/scripts/compare-libraries.mjs` measures it:
the same accordion built with each library, React external, and the motion
stylesheet counted separately.

Decided by the maintainer on 2026-11-25, in a grilling with two reviews
by a second model, which ran Playwright experiments in Chromium 153,
Firefox 155 and WebKit 26.6 with React 19.3.

## The packages

`@accordiondeck/react` (React 19), `@accordiondeck/react-18` (the same
source, built for React 18) and `@accordiondeck/docs`. There is no
`@accordiondeck/core`. In the other decks the core holds the engine. Here
the browser is the engine, and what remains (keyboard, value sync) is small
and React-shaped.

The JavaScript layer always ships. A zero-JS default, with a `react-server`
entry as in carouseldeck's ADR 0011 and the JS features opt-in, was
rejected. It would gain nothing in a client-only app or on React 18, give
two accordions on one page different keyboard behaviour, and double the
paths to test.

## The primitives

`import * as Accordion from '@accordiondeck/react'`: `Root`, `Item` (the
`<details>`), `Trigger` (the `<summary>`) and `Panel` (a div inside the
details). An `Item` with no `Root` is a collapsible. Every part takes
`render`, as drawerdeck's do, with two limits: `Item` must stay a
`<details>` and `Trigger` a `<summary>` that is the `Item`'s direct child. A
`<summary>` wrapped in another element is hidden, and the browser shows its
default summary instead. So the rivals' `Header > Trigger` shape is not
possible, and a heading goes inside the summary. A dev warning names a
wrong tag.

- **Root**: `multiple` (boolean). `value`, `defaultValue` and
  `onValueChange`, always `string[]`. `disabled`, which every Item takes,
  and no Item can turn back off. Always one open. `orientation` (default
  `vertical`) and `loop` (default `true`), the same defaults as Radix and
  Base UI. In single mode Root gives the group a `name` from `useId`.
  An optional `name` prop overrides it, because two roots server-rendered
  separately both get `_R_0_` and form one group before hydration.
- **Item**: `value`. `open`, `defaultOpen` and `onOpenChange`, which
  control a collapsible. Inside a Root the Root owns the state: `open` and
  `defaultOpen` are ignored with a dev warning, and `onOpenChange` only
  observes. It fires once per Item, from the same diff as `onValueChange`.
  Two `open` items mounted in one group open the first in Chromium and
  Firefox and neither in WebKit, so the state cannot have two owners.
  `disabled`.
- **Panel**: always rendered, with no lazy mode, because find-in-page and
  opening before hydration need the content in the DOM. Padding goes on the
  Panel, not on `::details-content`. No `aria-controls` and no
  `role="region"`: `<details>` already ties the summary to its content, and
  the APG advises against a region per panel when there are many.

## Keys

Enter and Space are native. Root adds Up, Down, Home and End between its own
Triggers, or Left and Right when it is horizontal, following `dir`. They
wrap at the ends unless `loop` is false. A key from a nested Root or from
a field inside a Panel is not the outer Root's.

## State and the browser

The browser toggles `open` itself, and React does not rewrite an attribute
whose prop has not changed. The reviewers' experiments showed what follows:
with `open={value.includes(id)}` and a parent that declines a change, the
DOM stays open while state says closed, in all three engines. A click
before hydration leaves a mismatch that `hydrateRoot` does not patch. So:

- **The Trigger click is React's.** The handler calls `preventDefault()`
  and React writes `open`. That blocks click, Enter and Space in all three
  engines. It acts only when the summary itself is the click's nearest
  activatable element and the event is not already prevented, so a link,
  button or checkbox inside a Trigger keeps its own behaviour.
- **`toggle` carries the opens nobody can prevent**: find-in-page,
  fragment navigation, clicks before hydration. Switching items in a group
  fires two `toggle` events in one task, with microtasks between them. So
  Root reads the whole group at the first one and diffs it against `value`,
  and the second finds nothing new. A parsed `open` also fires `toggle` on
  load.
- **A declined change is written back.** When a controlled parent does not
  take the new value, Root writes `open` back. After a find-in-page open,
  that closes the item with the match again, and the docs say so.
- **Hydration adopts the DOM.** Root reads what is open on mount and calls
  `onValueChange` with it, so a controlled parent catches up with a click
  made before hydration. Forcing `value` would close what the user just
  opened. `Item` sets `suppressHydrationWarning`. The one exception is
  always one open: if the DOM has no open Item under that rule, Root
  restores `value`.
- **Single mode keeps one value.** Given two, the first in document order
  wins, as the parser's rule for a named group does. Root trims `value`
  before it writes `open`, so the DOM never gets two, and warns in dev when
  `value.length` is more than one.

**Disabled** makes the Trigger inert and sets `aria-disabled`. It stays
focusable, arrow keys land on it, and find-in-page can still open its Item,
since closing it again would fight the browser's find highlight. Before
hydration a disabled Item opens natively, and hydration adopts it.

**Always one open** applies in single mode only, as Radix's
`collapsible={false}` does: the open Item's own Trigger is inert, and only
opening another Item closes it. A Root may still start with none open, and
it does not open one by itself.

## Motion

`@accordiondeck/react/motion.css` is optional. It animates
`::details-content` with `interpolate-size`: height when vertical, width
when horizontal, read from the Root's orientation. Every rule is in
`:where()`, every tunable value is a token, and it holds still under
`prefers-reduced-motion`. The standing decision "The packages ship no CSS"
was amended to allow an opt-in stylesheet like this one (GLOSSARY.md).

## The gate

A throwaway prototype runs before any v1 work, and every v1 issue is
blocked by its go/no-go. It checks, on real devices and screen readers:

1. **Headings inside the summary.** `<summary><h3>…</h3></summary>` in
   VoiceOver on macOS and iOS, NVDA and JAWS. If the heading holds up,
   Trigger takes a `level` prop. If not, accordiondeck ships without
   headings, and the docs and the accessibility section say so.
2. **Expanded state on iOS VoiceOver.** If VoiceOver does not announce
   expanded and collapsed, the prototype tries `aria-expanded` on the
   summary. If the state is still silent, `<details>` is a no-go.
3. **The state model above**, in Chromium, Firefox and WebKit: a declined
   change, a click before hydration, a group switch, find-in-page.
4. **Find-in-page in real Safari 26.2**, in a named group.

Rejected:

- **A heading wrapping a button, with `hidden="until-found"` on the
  panel.** It matches the APG exactly and gets find-in-page (Chrome 102,
  Firefox 148, Safari 26.2), but it does nothing until hydration. That is
  what Base UI and React Aria already are.
- **`<details>` from the server, swapped for a heading and a button on
  hydration.** Two DOM shapes, a layout risk at the swap, and twice the
  tests.
- **A JavaScript height animation where `interpolate-size` is missing.**
  One layout read per toggle in Safari and Firefox, and the claim would
  hold in Chrome only.
