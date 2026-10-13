# Loop places one real slide by translate over empty snap targets

This decision is accepted, on 2026-10-13. Three issues build it: #144 places
each slide once, in JavaScript; #145 moves that placement to CSS; #146
corrects a press at the seam. Until #144 lands, loop still renders full
copies (ADR-0009).

ADR-0009 built loop as clone and jump: a full set of copies on each side of
the slides, each a `Deck.Slide` rendered again, so its state, effects, ids
and media are its own and mount a second and third time. Anything a slide's
content does, such as a video player, an `id` or a running effect, runs
three times. `packages/docs/guides/known-limits.md` warned about it (#119).

**The maintainer's ruling (2026-10-13): each slide mounted once, not a
lighter copy.** Its children mount exactly once; refs, state,
effects, ids and media stay stable across the loop, the seam and the jump.
This supersedes the `useIsCopy()` brief of 2026-10-12, which only would have
told content it was in a copy: `Deck.useSlide().copy` already does that,
unchanged, for the small-deck fallback below.

## The technique

Native scroll snap stays the engine (ADR-0001, ADR-0006). Loop's copies
become empty, inert, `aria-hidden` boxes that render no children: _shells_
(GLOSSARY.md). The one real slide is moved onto whichever shell is nearest
the viewport, by `translate`.

**Snap points come from shells, for all five sets, as ADR-0007 already
allows.** ADR-0007 built an empty snap target standing in for a slide
wherever the slide's own box cannot be the snap target (there, because fade
stacks slides with `position: sticky`); ADR-0009 already renders one target
per copy too, when loop and an effect combine. This is that same mechanism,
generalised: a shell is a snap target with no copy of the slide's content
behind it. Engines snap to a translated box, so a moved real slide must
never be a snap area: it gets `scroll-snap-align: none`, unconditionally,
and a dedicated shell, at the real slide's own place among the sets and not
only the copies', carries its snap point instead. Five sets in all: the
real slides' own set (replacing what would have been its own snap point)
and two sets of shells on each side.

**Two sets each side, not one.** Measured on a real iPhone (#140): a single
flick's native momentum, or several flicks chained before any settles (iOS
can keep momentum going across a chained flick with no `scrollend` between
them), travels more than one set length before the scroller ever rests. A
mid-scroll correction was tried and cuts a smooth or momentum scroll dead at
the write, in both Chromium and WebKit, worse than the problem. A second
buffer set is the gentler fix: still only empty, inert boxes, so the extra
DOM cost is small. `reachable`, `resnap`'s window and `release`'s point list
(ADR-0009) generalise from one set's reach to two; the engine does not
otherwise care how many sets of shells there are.

**Shells are sized and positioned by measuring the real slides, not by
flowing in the track.** The real slides stay in normal flow, so the
consumer's layout CSS (width, gap, breakpoints) applies unchanged
(ADR-0003) and alone decides how much of the track they occupy. A shell
cannot also take flow space without doubling it, so shells are positioned
out of flow, each at its slide's own measured box plus its set's whole
multiple of the run's length, and sized to match it: the same
`alignCopies` idea ADR-0009 already has (copying a slide's `scroll-snap-align`
onto its copies at every settle), extended to position and size. A resize or
a layout change that moves the real slides re-measures and re-positions
every shell before the next settle.

**Placement is CSS first, with a JavaScript fallback.** Each real slide's
`translate` is driven by a scroll-driven animation
(`animation-timeline: scroll()`) on the compositor where `CSS.supports`
reports it; a scroll listener recomputes it on the main thread everywhere
else (Firefox today). Either way it composes with a consumer's own
`transform`: the two are independent properties, so both apply together. A
consumer's own `translate` is the property placement itself needs, and the
two cannot share it; the docs name `translate` as placement's, for a
consumer to avoid.

**The jump stays, and corrects translate in the same task.** At rest on a
shell, the engine jumps the scroll position back into the real slides' own
set, by whole set lengths, exactly as ADR-0009's `jumpOffCopies` already
does; nothing is cloned, so nothing needs re-measuring at the jump, only the
translate of whichever slides it moves. CSS placement recomputes on its own
from the new `scrollLeft`; the JavaScript fallback re-places explicitly, in
the same task, so nothing paints a wrong frame.

**No waiting at the seam.** Measured in the prototype: once `scrollLeft` is
clamped to the track's physical end, a `scrollTo` asking to go further is a
no-op the browser does not fire a `scroll` or `scrollend` event for, so the
jump never runs again and presses in one direction can pin the deck there.
Every Next, Prev, arrow key and dot press corrects the position into the
middle set first, synchronously, before it moves, so a press always has a
full set of room ahead of it whether or not a settle got the chance to jump.

**Start position after first paint.** Measured in the prototype on real
WebKit: a `scrollLeft` write made before the first paint is silently
dropped, while the identical write from a later task succeeds. The initial
position, including the shells' placement, is set a frame after mount,
never synchronously with it. Server HTML renders every real slide's
starting translate and every shell's starting geometry for `defaultIndex`
(ADR-0011's pattern: a good estimate from index arithmetic alone, corrected
before the first frame once the browser can measure), so hydration moves
nothing.

**A deck too small for shells keeps today's copies.** Placing a shell needs
room for it beside its own slide without a copy showing there too: a set
narrower than the viewport plus its widest slide cannot guarantee that
room. That test is wider than ADR-0009's, which decides a deck does not
loop at all on a set no longer than the viewport alone: a deck between the
two still loops, as ADR-0009 already has it, but falls back to rendering
full copies exactly as ADR-0009 built them, rather than shells. There,
`Deck.useSlide().copy` reports `'before'` or `'after'` in them as it always
has. Where each slide mounts once, `copy` is always `undefined`: a real
slide is never a copy of itself. The docs say which decks lack the
mount-once guarantee.

**Everything ADR-0009 built on copies keeps working.** The copies' snap
points reach a set past either end as before (`reachable`, ADR-0009); a
press or a wheel event on them still shifts the deck a set onto the slides
where nothing shows (`shiftOffCopies`); `--deck-slide-progress` and
`data-in-view` are still written per slide, in whichever slot it is placed;
click to focus, autoplay, synced decks, fade, curve, stack, pages, vertical
and right-to-left read the same; and #142's fix, which keeps a looping
deck's place once its own jump off a copy is still settling when the layout
changes (`jumping`), still applies. Only what measured a copy's own box
measures its shell instead.

## What is open to the implementation

This records the decided technique, not its code. Left to the stacked PRs
that build it (#119's brief allows landing placement first, then press
correction, then the small-deck fallback, provided `main` never ships one
half-done):

- the exact measurement this needs for the run's length (the distance from
  a slide to its own shell a set over) where slides are not uniform width;
- whether the CSS path and the JavaScript fallback can share one
  measurement-and-positioning pass, or need their own.

## Out of scope

- the VoiceOver pass, ruled for after release (ADR-0006's open check and
  this one share it): no slide announced twice or as a shell, and the
  sites make no screen-reader claim about loop until it is done;
- `will-change` as a default: left to the smoothness bench (#138), not
  this ADR.

## Supersedes, in part

ADR-0009's "React renders the copies; the engine finds them" is superseded:
a copy renders no children. Its loop mechanics, the snap-point generalisation
to copies past either end, `jumpOffCopies`, `shiftOffCopies`, a press or
wheel shifting onto the slides, and the move lifecycle of ADR-0006, are not
superseded; they are what this ADR extends from one set each side to two,
and from full copies to shells.
