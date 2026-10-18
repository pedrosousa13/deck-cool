# Measured geometry reaches CSS as unitless numbers, written at measure time

Split from #178 and #179, by #187. A consumer with fluid slides, sized by a
breakpoint or `flex-basis` rather than a fixed pixel width, cannot turn a
pixel measurement into a count of slides, or back, with CSS alone. CSS
cannot divide one length by another outside Chrome 140+ (`calc()`'s `/`
only divides by a number). Doing that arithmetic in JavaScript, with the
consumer's own `ResizeObserver`, is what #178 and #179 both needed and what
#187 replaces. The engine already measures the run of slides for its snap
points (`snapPoints`) and the viewport's own size (`axis.view()`); the fix
publishes those two measurements, rather than adding a third way to take
them.

**`Deck.Viewport` carries `--deck-viewport-step` and `--deck-viewport-span`,
as plain numbers with no unit.** `--deck-viewport-step` is the distance
from one real slide to the next along the axis, its size plus the gap.
`--deck-viewport-span` is the viewport's own size along the axis, in
multiples of `--deck-viewport-step`. A number, not a length, is the point: a
consumer's `calc()` can then divide pixels by `--deck-viewport-step`, or
multiply `--deck-viewport-span` by a length, in every browser, the same way
the progress guide's own scale example already reads
`--deck-slide-progress` as a plain number, never a length.

**Measured from what `writeProgress` and `snapPoints` already measure by:**
each real slide's own measuring box (`slidesOf`'s `boxes`: a snap target or
a shell, where the deck has one, never a copy), sliced to the real slides'
own, unshifted range (`first` to `first + n`). The step is the mean
distance from one box's start to the next's along the axis: exact where
every slide is the same size, since then every consecutive distance
already is; an average where they differ, read off the first and last box
alone (`(starts[n-1] - starts[0]) / (n-1)`), the same trick ADR-0013's own
run length `L` uses to stay independent of what sits between them. With
shells, reading the real slides' own set, never whichever buffer set a
slide is currently translated onto (ADR-0013), keeps the step the same
wherever the deck's slides are placed right now.

**A box's start is independent of a consumer's own transform on it.** Its
centre, from `getBoundingClientRect()`, less half its true, untransformed
size (`borderBoxSize`, the same subpixel measure `layoutShells` already
reads a real slide's size by). A centred `scale` -- a common progress
recipe, reading `--deck-slide-progress`, scales a slide by a different
factor from its neighbours -- leaves a box's centre where it is; measuring
from either edge instead does not, and skews the step by however much the
scale differs from one settle's focal slide to the next's. Curve transforms
only a slide's content, never its own box (ADR-0008), so it was never
exposed to this.

**Fade and stack read a true, if unexciting, value.** `stackedLayout` lays
out one snap target per slide, each exactly the viewport's own size along
the axis. Measured the same way, `--deck-viewport-step` then always reads
about the viewport's size, and `--deck-viewport-span` always about 1: true
to what carouseldeck actually scrolls by under them, not a slide-sized step
they do not lay out. The docs say so, rather than this ADR inventing a
different number for them.

**Unset, not zero or `NaN`, with fewer than two real slides.** A single
slide has no "next" one to measure a step from, so both properties stay
unset. A consumer's `var(--deck-viewport-step, <fallback>)` then falls
through to its own estimate, the same fallback it already needs before the
deck mounts, since neither property is in the server HTML either (nothing
has measured yet). Going from one slide to two, or back, sets or clears
both, rather than leaving a stale number from before.

**Written on the viewport alone, at measure time, like `--deck-slide-count`
and unlike `--deck-slide-progress`.** `settle` already recomputes the snap
points and the viewport's own size on every arrival; `writeGeometry` runs
there too, but, unlike `writeProgress`, which runs every scroll frame
because progress itself changes every frame, only calls `style.setProperty`
where the string differs from what is already there. Neither step nor span
depends on the scroll position, so index navigation alone never changes
them: in practice they are written only on a mount, a resize, or a slide
added or removed, never a React re-render, since the engine writes DOM
properties directly (ADR-0003). `destroy` removes both, as it already does
`--deck-slide-progress` on every slide.

**Named in the viewport's own namespace (ADR-0010, amended for #187).**
ADR-0010 named every slide output `--deck-slide-*` and left a later output
on another part "a new decision, not this one." This is that decision: the
viewport is a part of its own, so its outputs take a `--deck-viewport-*`
name, never one of their own standing alone. A consumer may already use any
`--deck-*` name outside `--deck-slide-*`, and a two-name viewport namespace
costs nothing once it exists; ADR-0010's own amendment records that it now
does.

**Rejected:** a consumer's own `ResizeObserver`, measuring the slides and
the viewport itself, as #178 and #179 both ended up doing before #187 fixed
it once, in the engine, which already has the measurement. A
length-returning custom property (`--deck-viewport-step: 176px`), rather
than a plain number, was rejected too: it reads naturally in isolation, but
a consumer's `calc()` cannot divide one length by another to get a slide
count out of it (outside Chrome 140+), undoing the whole point.
