# Measured geometry reaches CSS as unitless numbers, written at measure time

Split from #178 and #179 (#187). A consumer whose slides are fluid, sized by
a breakpoint or `flex-basis` rather than a fixed pixel width, cannot turn a
pixel measurement into a count of slides, or a count of slides into pixels,
with CSS alone: CSS cannot divide one length by another outside Chrome
140+ (`calc()`'s `/` only divides by a number). Doing that arithmetic in
JavaScript, with the consumer's own `ResizeObserver`, is exactly what #178
and #179 needed and what this issue's brief named as the alternative. The
engine already measures the run of slides to find the snap points
(`snapPoints`) and the viewport's own size (`axis.view()`); the fix is to
publish those two measurements, not to add a third way of measuring them.

**`Deck.Viewport` carries `--deck-step` and `--deck-view`, as plain numbers
with no unit.** `--deck-step` is the distance from one real slide to the
next along the axis, its size plus the gap; `--deck-view` is the viewport's
own size along the axis, in multiples of `--deck-step`. A number, not a
length, is the point: a consumer's CSS can then divide pixels by `--deck-step`
or multiply `--deck-view` by a length, with ordinary `calc()`, in every
browser, the same way the progress guide's own scale example already reads
`--deck-slide-progress` as a plain number, never a length.

**Measured from what `writeProgress` and `snapPoints` already measure by:**
each real slide's own measuring box (`slidesOf`'s `boxes`: a snap target or
a shell, where the deck has one, never a copy), sliced to the real slides'
own, unshifted range (`first` to `first + n`). The step is the mean distance
from one box's start to the next's along the axis: exact where every slide
is the same size, since then every consecutive distance already is; an
average where they differ, read off the first and last box alone
(`(starts[n-1] - starts[0]) / (n-1)`), the same trick ADR-0013's own run
length `L` uses to stay independent of what sits between them. With shells,
reading the real slides' own set rather than whichever buffer set a slide is
currently translated onto (ADR-0013) means the step reads the same wherever
the deck's slides are placed right now, never only at rest.

**Fade and stack read a true, if unexciting, value.** `stackedLayout` lays
out one snap target per slide, each exactly the viewport's own size along
the axis. Measured the same way, `--deck-step` then always reads about the
viewport's size, and `--deck-view` always about 1 — true to what carouseldeck
actually scrolls by under them, not a fabricated slide-sized step they do
not lay out. The docs say so, rather than this ADR inventing a different
number for them to special-case.

**Unset, not zero or `NaN`, with fewer than two real slides.** A single
slide has no "next" one to measure a step from, so both properties are left
unset: a consumer's `var(--deck-step, <fallback>)` falls through to its own
estimate, the same fallback it already needs before the deck mounts, since
neither property is in the server HTML either (nothing has measured yet).
Going from one slide to two, or back, sets or clears both rather than
leaving a stale number from before.

**Written on the viewport alone, at measure time, like `--deck-slide-count`
and unlike `--deck-slide-progress`.** `settle` already recomputes the
snap points and the viewport's own size on every arrival; `writeGeometry`
runs there too, but (unlike `writeProgress`, which runs every scroll frame,
because progress itself changes every frame) only ever calls
`style.setProperty` where the string differs from what is already there.
Since neither step nor view depends on the scroll position, index
navigation alone never changes them, so in practice they are written only
when the geometry a settle reads back out has actually moved: a mount, a
resize, or a slide added or removed, exactly as the brief asks, and never a
React re-render, since the engine writes DOM properties directly
(ADR-0003). `destroy` removes both, as it already does `--deck-slide-progress`
on every slide.

**No shared namespace with the viewport's own name.** ADR-0010 named every
slide output `--deck-slide-*` and left a later output on another part "a new
decision, not this one." There are only two viewport outputs so far, and
`--deck-step` and `--deck-view` don't collide with any `--deck-*` input a
consumer already sets (`--deck-control-*`, `--deck-dot-*`, `--deck-focus-*`,
`--deck-accent`, `--deck-transition-duration`, `--deck-curve-radius`), so
each is simply named after what it measures, as the brief already names
them, rather than inventing a `--deck-viewport-*` prefix two names do not
yet need.

**Rejected:** a consumer's own `ResizeObserver`, measuring the slides and
the viewport itself, as #178 and #179 both ended up doing before this issue
split out to fix it once, in the engine, which already has the measurement.
A length-returning custom property (`--deck-step: 176px`), rather than a
plain number, was rejected too: it reads naturally in isolation, but a
consumer's `calc()` cannot divide one length by another to get a slide
count out of it (outside Chrome 140+), undoing the whole point.
