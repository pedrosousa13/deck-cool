---
title: Server rendering
description: 'How carouseldeck renders on the server: at defaultIndex with no layout shift, progress in the server HTML, and Deck.Root as a React Server Component.'
---

The primitives render on the server. Where the browser supports
`scroll-initial-target`, server HTML rests at `defaultIndex` before any script
runs. Elsewhere a layout effect moves there before the first paint. Either
way, with one slide per snap point, there is no layout shift.

Each slide carries its starting `--deck-slide-progress` in the server HTML.
That is its distance in slides from the slide the deck starts at. With loop,
a slide's starting `translate` places it onto the shell its index estimates
it nearest to, and the shells themselves get an estimated position too; a
deck too small for shells falls back to copies, each measured by its own
place in the run. Fade, curve and your own CSS on progress then paint from the
server HTML as they do once hydrated. With equal-size slides, one per snap
point, the engine's first measurement gives the same values, so hydration
changes nothing.

The server cannot measure, so it renders Prev and Next, and Dots and Counter
with one page per slide. Hydration corrects them where that is wrong. It
removes the controls when every slide fits, and recounts Dots and Counter when
several slides share a snap point or the deck snaps in pages. Where `Deck.Root`
cannot see the slides ahead of time, as when `Deck.Viewport` sits inside your
own component, Dots and Counter render empty until hydration. `useDeck()`
reports a `count` of `null` on the server, so a counter built on it renders
its total at hydration.

A React Server Components framework such as the Next.js App Router renders
the deck straight from a server component, `effect={fade}` and the theme
included. The client entries, `@carouseldeck/react` and its effects, start with
`'use client'`. Under the `react-server` export condition, which these
frameworks resolve for a server component, `@carouseldeck/react` resolves to a
server entry instead. Its `Deck.Root` is a server component that counts the
slides, so Dots and Counter count a page per slide there too. Every other
export is the client entry's own. A framework that does not resolve
`react-server` gets the client entry, and Dots and Counter render empty until
hydration.

In a server file, `Deck.Root` is a server component, not a client reference.
Render it there as an element. Passing it as a value to a client component,
as in `as={Deck.Root}`, fails. Import it in your client component instead.
Function props, such as `onIndexChange` and `onFocalChange`, and a `ref` to
the handle cannot cross from a server component. To use them, render the deck
from your own client component. An effect of your own crosses only from a module
that starts with `'use client'`.
