# Geometry is CSS; React re-renders only on index and focal changes

Slides per view, gap, alignment and their breakpoints are plain CSS on the
slides, never props. Slidedeck reads the resulting snap points from layout.
That makes responsiveness free and keeps it out of slidedeck's API.

React state changes only when the current index or the focal slide changes.
Continuous values — progress, in-view state — are written to the DOM as custom
properties and data attributes, so scrolling never re-renders.

The structural styles a deck needs to function (the scroller, snap type,
overflow) are set inline on the primitives, as playdeck does, so a deck works
with no stylesheet. Appearance ships as an optional `theme.css`, except a
hidden viewport scrollbar (amended for #84; see below).

That is why a deck's orientation is a prop and its writing direction is not.
The primitives set the snap type inline, so the deck must choose its axis
(`orientation`). Writing direction is read from the computed `direction`, so
`dir` on any ancestor applies. A live switch is followed when a `dir`
attribute changes, not when only CSS changes `direction`.

Slide width and snap alignment are geometry, yet a deck with no stylesheet
still needs them. They ship as zero-specificity `:where()` defaults, injected
through React 19's `<style precedence>`, not inline: an inline style would
beat consumer CSS, which owns geometry. React state changes only when the
current index or the slide count changes, never per scroll frame.

**The viewport's scrollbar (amended for #84).** The scrollbar is appearance,
yet it ships in the same always-injected stylesheet, not `theme.css`: every
deck should hide it, with no stylesheet too, as with the slides' sizing. It
also changes the viewport's client size where scrollbars take layout space, so
it belongs with the geometry defaults the engine measures against. The rules
are `:where([data-slidedeck-viewport]) { scrollbar-width: none }`, with zero
specificity, and `:where([data-slidedeck-viewport])::-webkit-scrollbar
{ display: none }` only where `scrollbar-width` is not supported, which counts
one element for the pseudo-element. Either way the consumer stays in control:
`[data-slidedeck-viewport] { scrollbar-width: auto }` brings it back, and a
consumer's `[data-slidedeck-viewport]::-webkit-scrollbar` rule wins over the
default. Unguarded, the pseudo-element would keep hiding it in Chromium, which
honours `::-webkit-scrollbar` while `scrollbar-width` is `auto`. Inline style
cannot reach a pseudo-element, and would beat the consumer's rule.

An accepted exception for autoplay: a deck with `autoplay` also re-renders
when autoplay's user-driven state changes: whether it is playing, a pointer is
over the deck, the document is hidden. Those are discrete user-driven
events, never scroll frames, so scrolling still never re-renders. A deck
without `autoplay` tracks none of that state and is unaffected. (Amended for
#189: a deck with `autoplayResume` also tracks whether focus is in the deck,
since restarting autoplay needs to know when that ends too; a deck with
`autoplay` alone still tracks none of it.)

Server HTML rests at slide `defaultIndex` where `scroll-initial-target` is
supported; elsewhere a layout effect moves there before the browser paints. No
layout shift either way. Where several slides share a snap point, or a deck
snaps in pages, the first paint may correct after hydration: server HTML can
only start at a slide.

A second accepted exception: the server cannot measure, so it renders the
controls as if each slide were a page and the slides overflow. Prev and Next
always render, and Dots and Counter count one page per slide. Layout shifts
only where that is wrong: hydration removes the controls when every slide
fits, and corrects Dots and Counter to the snap points when several slides
share one or the deck snaps in pages. Where Root cannot see the Viewport's
slides (a Viewport inside a custom component, or one child component that
renders several slides), the server count is a guess: Dots and Counter render
empty, or count the slides Root can see, and correct at hydration.
(Amended for #92: a Viewport rendered from a React server component reaches
Root as a client reference, which Root cannot see through, so Dots and Counter
render empty until hydration.) (Amended for #94: a server entry now counts
the slides there; see ADR-0011.)
