# Loop places one real slide by translate over empty snap targets

This decision is accepted, on 2026-10-13. **Status: built, in #144
(JavaScript placement), #145 (CSS placement where supported) and #146 (a
press corrects at the seam).** Three issues build it: #144 places each slide
once, in JavaScript; #145 moves that placement to CSS, where the browser
supports it; #146 corrects a press at the seam.

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
from the new `scrollLeft` where the write lands before the frame's own
scroll-timeline update; where it does not (#145's pins, below), a pin covers
the rest. The JavaScript fallback re-places explicitly, in the same task, so
nothing paints a wrong frame.

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

## As built (#144)

JavaScript placement, decided above, built as follows. #145 and #146 are
still to come; nothing here is theirs to settle.

**The spacers.** Out-of-flow shells cannot sit at negative offsets, so two
in-flow spacers, `order: -1` on the one before the slides, push the real
slides `2L` in and leave the same room after them. Each is sized `2L` less
one gap, so the scroll range matches a five-set copies layout exactly.

**The run's length, `L`.** Measured from the real slides alone, independent
of where they are currently translated to (a slide sitting over a buffer
shell must not throw `L` off by a multiple of itself): the distance from
the first slide's own start to the last slide's end, plus its trailing
margin, the viewport's gap and the first slide's own leading margin. This
settles the open question of non-uniform widths: the formula only reads the
first and last slide's position, so it holds regardless of what sits
between them.

**The placement metric and tie rule.** Each real slide is translated onto
whichever shell's centre is nearest the viewport's centre. A tie, within
half a pixel of the midpoint between two shells, goes to the slot after,
matching the SSR estimate's own rounding exactly so server HTML and the
engine never disagree on an exact tie.

**The stacked progress range.** With a stacked effect (fade, stack), the
shells are the effect's own snap targets, not out-of-flow boxes: the run
becomes `5n` shells, five full sets, never three copies, with no spacer and
no translate. A thrown slide's progress wraps into `(b, b+n]`, `b = -0.9985` (the
maintainer's ruling, 2026-10-13, on wrapping a thrown card where shells give
it no copy of its own to land on): within the engine's own precision of -1,
it returns at the back, keeping the shipped card-stack recipe and its e2e
test unchanged.

**`DeckState.copies`, and which way the fallback switches.** The engine
publishes `copies: boolean`, true once the run is too short for a shell to
have room beside its own slide (length less than the viewport plus the
widest slide, less half a pixel's tolerance against an exact boundary). It
never oscillates between the two ways of measuring the threshold, since
both read the real slides' own layout, whichever technique is currently
rendered: `L` grows `n` times as fast as the widest slide widening does, so
only slides _narrowing_ can cross the threshold and switch a mounted deck
from shells to copies, never widening. Always false with a stacked effect:
a stacked shell is never translated, so a short run needs no room beside
it, and the fallback never raises for one.

**The start write, and its re-check.** The initial scroll position,
including the shells' own placement, is written synchronously, in the
constructor. In shells mode only, the next animation frame checks the
position again against the deck's own current index (WebKit can silently
drop a write made before the first paint), and writes it once more if
nothing else has moved it since: the only way it can still read unmoved is
that the first write never took.

**The resize compensation.** A resize or a slide change that moves `L` also
moves the spacers, which would otherwise shift every slide after the
first in flow. `layoutShells` is called twice: once to measure the real
slides' own, briefly stale position before the spacer's new size lands, and
again after, to read their true settled one. The current index's own shell,
compared between this settled reading and `known` (the last settle's own
reading, tagged with the kind it was read under, `kindOf`), gives the whole
shift to undo by `moveBy`: the spacer's own share plus whatever a slide
before the current one adds. `known` must be read under the _same_ kind:
a slide added or removed moves it within shells' own kind, which this
compensates; a kind change itself (stacked to shells, or shells to copies)
is `keepPlace`'s shift to make, never this one's.

**Snapping, off while shells are relaid out.** Writing a shell's or a
spacer's new geometry under mandatory snapping can leave the viewport
resting off every current snap area for a moment; Chromium re-snaps for
that at once, on its own, before the compensation above is even read back.
Snapping turns off for the whole resize-detected refresh or settle, through
to the settle it leads to, not for a refresh where nothing changed, since
toggling it with nothing to show for it risks a phantom `scrollend`.

**`overflow-anchor: none`.** Resizing the before-spacer can leave content
above the viewport's own rest point larger or smaller than it was: exactly
what the browser's own scroll anchoring reacts to, adjusting the scroll
position on its own before the engine's next read of it. Measured in
WebKit, its adjustment and the engine's own compensation then both move the
viewport for the same resize, overshooting. A shells deck's viewport gets
`overflow-anchor: none` at zero specificity (`:where(…)`), opting the whole
subtree out, so the engine alone ever moves it; a consumer can still
override it, at their own risk.

## As built (#145)

CSS placement, decided above, built as follows.

**The feature test.** `createDeck` reads `typeof ScrollTimeline ===
'function' && CSS.supports('animation-timeline: scroll()')` once, into
`timelines`, in its own scope rather than a module-level constant: the
check runs afresh for every deck a page mounts, so a test can stub
`CSS.supports` before mount and force the JavaScript path in a browser that
could otherwise place by CSS. The check never re-runs once a deck's own
engine has started.

**Web Animations with a `ScrollTimeline`, not a named timeline in CSS.**
Each real slide, in shells mode, gets its own animation:
`slide.animate(keyframes, { timeline: new ScrollTimeline({ source:
viewport, axis }), fill: 'both' })`. Under the docs site's CSP (`style-src
'self' <hashes>`), an appended `<style>` is refused in both Chromium and
WebKit, and per-deck keyframes hold measured values no hash could ever
list. A constructed `CSSStyleSheet` with a static `@keyframes` would be
CSP-safe, but it would grow `deckDefaults` and need `DECK_STYLE_HASHES`
regenerated on every page, and the inline `animation` shorthand it needs
would replace a consumer's own `animation` on a looping slide, which
`slide.animate` does not. So the issue's brief of "a named scroll timeline
on the viewport" is built as a `ScrollTimeline` made from script, not a
named one in CSS: the same timeline type the brief names, made where the
engine already runs rather than in a stylesheet this repo cannot ship it
in.

**The keyframes reproduce `nearestSlot`.** `placerKeyframes` builds four
`step-end` boundaries, `length` apart, marking where a slide's own centre
crosses from one slot to the next; `geometry.max` turns each into the `[0,
1]` progress a scroll timeline reports. `PLACER_EPSILON_PX`, `1/64` px,
sits just below every boundary: WebKit's `ScrollTimeline` samples progress
in single precision, off a true boundary by about `6e-8` of the scroll
range (under `1/64` px at ranges up to 100 000px), so without it a position
exactly at a boundary could read as just short of it, a frame late onto the
next slot.

**`layoutShells` measures with translate neutralised, not pinned.**
`measureShells` sets every real slide's `translate` to `none` with
`!important`, calls `layoutShells` unchanged, then restores whatever
`translate` each slide had before: the neutralising write never outlives
the one measurement it is for, and does not itself place anything.
`placeOrPin`, the caller, decides each slide's next slot once the geometry
is fresh, at the same call sites shells already used on the JavaScript
path.

**The pins.** The CSS Scroll-Driven Animations spec (drafts.csswg.org,
§5.1, "HTML Processing Model: Event loop") updates a scroll progress
timeline's current time once a frame, during step 7.10, as step 1 of
updating animations and sending events; a write the engine makes after that
step, in the same frame, is not reflected until the next one. Measured with
a pre-paint sampler (a `ResizeObserver` callback, which runs after layout
and before paint): a scroll-position write from a `scroll` or `scrollend`
handler, or from a task, reads back fresh in both Chromium and WebKit, but
a write from a `ResizeObserver` or a `requestAnimationFrame` callback reads
back stale in WebKit alone, for one frame; so does a just-created
animation's first frame, reporting `none` in WebKit until its `ready`
promise resolves. `pinPlaced` writes each real slide's `nearestSlot` value
as an inline `translate: … !important` wherever a stale frame could
otherwise show: `settle` after the jump, `moveBy`, and `compensateShift`'s
own resize-only move. A shared `requestAnimationFrame` lifts every pin once
no placer's animation is still `pending`, so the unpin never runs before
the animation it uncovers has a sampled value of its own.

Task 2's pre-paint samples (the mount itself, a resize that moves `L`, and
a whole-set `restOn` from a resize) found no blank frame and no slide off
its own shell, in Chromium or WebKit, with the pins in place. Disabling
`pinPlaced` locally did not fail any of those three cases in this
Playwright WebKit build (26.6): by the time this build's own
`ResizeObserver` gets a turn, the real engine's write, watched the same
way, already reads fresh. A minimal, isolated repro (a bare `ScrollTimeline`
animation plus a second `ResizeObserver` reading `getComputedStyle(…).translate`
right after a `scrollLeft` write inside its own callback) does reproduce
the staleness the spec and MDN's processing model predict. So the pins
stand on the spec's own text and on that isolated repro, not on a test that
fails against the engine's own call pattern in this WebKit build: kept as a
guard against a sampling order the spec allows, and a future WebKit build
could still expose, not as proven necessary here.

**`seedPlacedAt` and `placedAt` stay JavaScript-path only.**
`seedPlacedAt`'s job, matching the SSR estimate before `layoutShells`
subtracts it, is already done by the neutralising measurement; `placedAt`
is never written on the CSS path, since nothing reads it as the truth
there (`slotOf`, next).

**The slot readers.** `writeProgress`, `onClick` and `onFocusIn` go through
one `slotOf(slide, i, along)`: `placedAt.get(slide)?.slot ?? 0` on the
JavaScript path, or `nearestSlot` computed fresh against the slide's own
measured centre on the CSS path, agreeing with the painted slot except
within `ε` of a boundary, always off screen wherever shells apply.

**Following an axis or a direction change, and leaving shells mode.**
`ScrollTimeline.axis` is read-only once a timeline is made, so
`syncPlacers` discards and remakes every placer on a `placersVertical`
mismatch, which an orientation change reaches through the engine's own
`refresh`; a direction change needs only new keyframes, since the
signature `syncPlacers` builds already reads `along.sign`, so the next
settle or refresh picks it up. `forgetPlaced` cancels every placer, the
shared unpin frame and any pinned inline `translate`, at `clearShells`'s
own two call sites (`refresh`, on leaving shells mode, and `destroy`, on
unmount), so neither outlives shells mode; `syncPlacers` already forgets a
placer on its own, as a side effect of `measureShells`, wherever
`placement` itself goes null.

**Bundle.** 11.26 KB to 11.99 KB min+gzip for placement itself, 12.01 KB
min+gzip once #145 is complete (`compare`); #144's own growth was still
unreleased when #145 landed.

## As built (#146)

Press correction, decided above ("No waiting at the seam"), built as
follows.

**`shiftOffCopies` runs unguarded from a step.** The shift it already made
for a press or a wheel event on the copies (ADR-0009, amended for #48 and
#96) is the same correction a step from Next or Prev needs, so `step` calls
it too, with its guard on a move already in flight lifted (`force`): a tap
or a wheel event leaves a move going, to jump off its copy or shell at rest
as ever, but a step from Next or Prev never waits for one, each press
superseding the last before it settles, so it must correct the position
itself, synchronously, before every step. The correction reads the live
scroll position, not `move.target`: a target far out in index space still
names the same slide once wrapped, so correcting the position alone is
enough to give `scrollTo`'s own reachability check room again; no target
bookkeeping to keep in step with it.

**Measured with a deck of 7 slides, 40 Next presses 50 ms apart, then 40
Prev.** In Chromium, the existing per-press and per-settle corrections
already kept the deck off the scroll range's edge before this, in both
placement paths. In WebKit, both paths pinned it at the edge partway
through the run, dropping every press after: a `scrollTo` already clamped
there is a no-op the browser fires no event for (above), so nothing ever
corrected it back. With `shiftOffCopies` run unguarded, neither browser
pins, in either path, and the deck lands on the slide 40 presses from where
it started, each way.

**Scope: Next and Prev alone.** Next and Prev step through `step`, so both
read the correction above. Dots and arrow keys do not step, and needed their
own check. A dot's `scrollTo` goes the direct way, within the slides
(ADR-0009): it is already clamped into the middle set, so it never reaches
the shells or the scroll range's edge, and was never at risk. An arrow key
scrolls the viewport by the browser's own native, unsnapped increment per
keydown, through neither `step` nor `scrollTo`, so the same test run against
it, 40 ArrowRight presses 50 ms apart then 40 ArrowLeft: in Chromium and
WebKit, on both placement paths, the position never pinned at either end of
the scroll range for longer than a frame or two, and the deck kept
answering a press after. A native key scroll moves in small steps, each one
its own `scroll` event, so the engine's own settle keeps correcting it the
whole way, where a `scrollTo` clamped outright at the edge gives it nothing
to correct from. `onKeyDown` needed no change.

**Bundle.** 12.02 KB min+gzip (`compare`), up from 12.01 KB.

## As built (#154)

A looping deck's `setOrientation`, fixed as follows.

**`placedAt` forgets every entry on an axis change, before `layoutShells`
next reads it.** `Placed` records a slide's slot, offset and the axis'
`sign` it ran under (above), but never which axis: `layoutShells` reads a
recorded offset back out as `placed.offset * placed.sign * along.sign`,
assuming it still runs along `along`, the axis current right now.
`setOrientation` flips `vertical` and calls `refresh`, which does not
touch `placedAt`; its next `layoutShells` call then subtracts a slide's
still-physically-old-axis translate as if it ran along the new one. With a
square viewport and `defaultIndex: 0` (two of five slides at slot -1 at
mount), this read L as 3000, twice its true 1500.

**`compensateShift` always recovers the true L by the next settle, so
nothing paints the corrupted one.** It already re-measures whenever a
settle's `layoutShells` reads a different L than the one before it, the
same check a genuine resize needs; an axis-corrupted L reads as exactly
such a change, so the existing resize path reads it again, and whatever it
writes next (however corrupted the slot it computes) is self-consistent
(an already-applied translate, read back out, always nets to the same
untranslated home), so a further read recovers the true L regardless. CSS
placement (`syncPlacers`'s own `placersVertical` check) never corrupts in
the first place.

**What does reach the screen: each real slide's own `translate` written
twice, not once.** The wrong read still computes a wrong slot and writes
it, inline, before the corrected read overwrites it with the true one,
both within the same task, so neither ever paints, but the JavaScript
path's whole point (`placedAt`'s "no further box read, mid-scroll") is
writing a slide's own translate exactly once a settle, matching the CSS
path's "no script per frame". A new real slide forgets its own placement
instantly, the same way `syncPlacers` already discards every placer on a
`placersVertical` mismatch (above): `measureShells` deletes every real
slide's `placedAt` entry on its own `placedVertical` mismatch, right
before `layoutShells` reads them, so no old-axis offset is ever read back
out along the new axis, and a slide whose slot does not change writes no
translate at all.

**Settling never depends on which it currently renders (amended for #196).**
"`DeckState.copies`, and which way the fallback switches", above, claimed
the threshold "never oscillates between the two ways of measuring it". That
held only while the deck stayed mounted in shells or copies. A third state,
rendering neither, is reachable too: once a settle finds nothing to loop at
all (ADR-0009), the caller drops both. `snapPoints`'s own "nothing to loop"
check read the run's length from whichever of shells, copies or neither was
currently in the DOM, and that read disagreed with itself across the drop:
shells measured the real slides directly, the same way `layoutShells`
already does; copies measured a slide to its own copy; neither read the
browser's own rests over the plain slides, which a bled viewport (the
padding recipe, #177) can leave with real, if small, scrollable room the
other two never saw. `count` then flipped between one snap point and
several, forever, each flip toggling loop's own markup back and forth with
it. `fallbackToCopies` disagreed along with it: it kept reading a shells
`placement` left over from a settle `snapPoints` had already moved past,
publishing `copies: true` in the very settle that found nothing to loop.

The run's length is now read from the real slides alone, whichever of the
three the deck currently renders: shells' own measurement where there is
one, `placement.length` (already `layoutShells`'s own read of the real
slides, translate removed), or an equivalent read of the real slides
directly otherwise (`runLength`). A stacking effect's slides sit in one
place rather than running along the axis (ADR-0007), so neither reads its
run; the snap targets' own boxes still do, as before. `fallbackToCopies`
reads this same settle's own "nothing to loop" finding first, rather than
re-measuring on its own, so `copies` reports correctly from the first settle
a deck finds nothing to loop, never a settle behind it. A deliberate
consequence, not a silent one: copies mode's own cut-over now reads the
same real-slide length, never a copy's own rendered box, so a consumer's
own progress-driven `scale` (the curve recipe) no longer nudges the
shells-or-copies boundary the few pixels its own, transformed box used to
add or remove: `DeckState.copies`'s own doc already says the threshold is
"measured the same way whichever is rendered", the real slides' own layout
rather than anything drawn on screen.

**Whether the deck loops is the engine's own option, not a flag latched
from the DOM (amended for #196).** A first version of the fix above kept a
sticky flag instead, set once a settle found the DOM showing shells or
copies, and never cleared. That is correct for a deck whose `loop` prop
never changes, but React keeps the same engine across a `loop` change
(`Deck.Root`'s own `createDeck` effect depends only on `defaultIndex`), so
a deck that looped once and then turned `loop` off kept measuring with the
real slides' own run regardless of the prop: under a bled viewport's own
small, genuine extra scroll room, this wrongly kept it collapsed to one
snap point, where a deck that had never looped reported several.
`DeckOptions.loop` and `setLoop` replace the flag, the same pattern
`orientation` and `setOrientation` already have: "is there room to loop"
depends on `loop`'s own current value alone, from whichever caller passes
it, never on what happens to be mounted.

## What is open to the implementation

This records the decided technique, not its code. Left to the stacked PRs
that build it (#119's brief allows landing placement first, then press
correction, then the small-deck fallback, provided `main` never ships one
half-done):

- **The CSS path and the JavaScript fallback share one
  measurement-and-positioning pass**, settled in #145: both read
  `layoutShells`, over translate neutralised the same way, and place by the
  same `nearestSlot`: the CSS path encoding it in each slide's keyframes,
  read fresh by `slotOf`; the JavaScript path calling `place`, which calls
  `nearestSlot` directly. Neither path owns its own geometry.

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
