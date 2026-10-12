# Loop copies are rendered by Viewport and never counted

ADR-0006 chose clone and jump for loop (the technique's name; the elements are
_copies_, GLOSSARY.md): a full set of copies on each side of the slides,
`aria-hidden` and `inert`, and a jump of one set length onto the identical
slide once the viewport rests on a copy's snap point, never mid-motion but for
a press on the copies (amended for #48, below) and a wheel event there
(amended for #96, below). This records how it is built
(#11) and what loop does with the deck's other features.

**React renders the copies; the engine finds them.** `Deck.Root loop` makes
`Deck.Viewport` render each slide three times: the slides, a set of copies
marked `data-slidedeck-copy="after"`, and a set marked `"before"`. Server
HTML holds them too, so it already rests on the slide at `defaultIndex`,
and hydration moves nothing. The engine takes no loop option: as with snap
targets (ADR-0007), a viewport that holds copies loops. A copy is a
`Deck.Slide` rendered again, so it looks like its slide with no cloning of
DOM, but its state is its own and an `id` inside a slide repeats.

**The copies before the slides come after them in the document**, placed
first with `order: -1`. A consumer's `:nth-child()`, as in pages, then still
counts the slides from 1. The copies are inert and hidden, so the split
between visual and reading order that rejected the `order` variant of
reposition in ADR-0006 does not apply to them. CSS that picks slides by their
place among the viewport's children would still pick the wrong copies, so the
engine copies each slide's computed `scroll-snap-align` onto its copies,
inline, at every settle: pages whose last page is short loop correctly.

**Only the slides are counted.** The current index, `onIndexChange`, the
handle, Dots, Counter, `data-current`, `data-focal`, `onFocalChange` and the
live region all speak of the slides' snap points and slides. A copy is never
current or focal. Internally a step may target a snap point up to a set past
either end, on the copies; `target()` reports the slide's index it copies.
Prev and Next step across the seam; `scrollTo`, Dots and a new controlled
`index` go the direct way, within the slides, never round the seam.

**A loop has no end, but a move runs only as far as the copies.** A step
past the copies, as when presses come faster than the deck moves, goes
instead to the nearest copy of the same slide, or the slide, at least half a
snap point ahead of the viewport the way the step goes (the viewport as read
can trail the scroll by a frame). Where none is ahead, as when presses come
about as fast as the deck moves and the viewport has overtaken them, it goes
to the furthest snap point ahead that the copies reach, and a press beyond
that is dropped: a press while the deck is already there, or heading there,
does nothing. So when presses outrun the copies the deck passes fewer slides
than were pressed. In exchange it never moves against a press, never jumps
mid-motion (a press of the pointer or a wheel event on the copies aside,
amended for #48 and #96),
comes to rest on a copy and jumps to its slide as always, and
`onIndexChange` reports where it rests. At rest it is always on a slide, so
a press at rest always moves it one snap point. A step from a rest the deck
could not jump off, as off a snap point, goes on from the snap point nearest
the viewport, a copy's included. A copy's snap point past either end of the
scroll range, as a centred deck's last copies' are, counts as past the
copies.

A press as the deck arrives on a copy, before that scroll's end, goes on
from the copy. The arrived move does not jump; the new move does at its end
(ADR-0006, a move's lifecycle).

Two other rules were tried and rejected. Moving the viewport back a set
mid-motion to make room: the instant scroll ends with a `scrollend` of its
own, which settled the deck, and a jump mid-motion is what ADR-0006 rules out.
(Amended for #48 and #96: a pointer pressed on the copies, or a wheel event
there, does move the deck back a set, below. A press of Next still does
not.) Carrying the target: the deck
went to the end of the copies, jumped at rest, and went on to the target it
carried. Every press counted, but the carried move outlived the rest it
crossed, and fought what came after it. It could stop on a copy at the end of
the range and never jump, after which Prev and Next did nothing; a mouse drag
right after its jump was ignored and left snapping off; and a wheel against it
was undone when the deck went on to the carried target. Dropping the presses
the copies cannot reach is simpler and cannot fight the user.

**A press on the copies moves the deck onto the slides (amended for #48).**
Measured by the maintainer on an iPhone: touch swipes chained faster than
the deck comes to rest stopped after three to six, at an end of the scroll
range; and with the event log of #82, the same in desktop Chrome with mouse
drags, each pressed while the last still moved. Each swipe goes on from the
momentum of the one before, or a drag from its release's move, so the deck
never rests, never jumps off a copy, and runs through the one set of copies
ahead of it. The maintainer decided on 2026-10-06 to jump at the next touch.

So a touch or a pen pressed on the viewport, or a mouse drag as it starts,
while the viewport is nearer a copy's snap point than any slide's, moves it
at once by a set, to the same place among the slides. The shift is measured
as the jump off a copy is, from the copy's own rest to its slide's. The
swipe or drag that follows starts with a full set of copies ahead of it.
The slides show what the copies did, so nothing shows: the index does not
change, nothing is reported or announced, focus stays, and the shift's
scroll paints progress and in-view before the frame that draws it. The
jump at a settle stays.

- A mouse click shifts nothing. It scrolls nothing, and leaves a scroll in
  flight going, a wheel's momentum included; a drag takes that scroll over
  as it starts, with snapping already off, so the shift comes there,
  before the drag first moves the deck. A deck with drag off never shifts
  for the mouse.
- A move in flight is left going: a tap shifts nothing, and the move ends
  on its target and jumps there as ever. A pan takes the move over first,
  at `pointercancel`, and the shift comes then. So no move is restarted,
  and no move's easing starts over.
- Snapping is off for the shift alone. Under mandatory snapping the
  browser snaps a script's scroll, which would move the deck up to half a
  snap point. Measured in Chromium, snapping put back with a finger down
  snaps nothing, and the swipe after it snaps as usual; put back with no
  gesture under way, it snaps the deck at once, which is why a click must
  not shift. Text selection is left alone.
- Measured in Chromium, a touch fling goes on past the press until the
  browser takes the touch over as a pan, with `pointercancel`, and undoes a
  shift made before then. The content there is the same, so that shows
  nothing, and the shift is made again at the `pointercancel`.
- The shift's own scroll ends while the finger is down, so its settle is
  owed, and a touch lets go only when the last finger lifts (ADR-0006,
  amended for #48): the pan settles at its own end, never as it begins.
- Every press runs it, so it reads no layout off the copies. Where the deck
  is is read against the snap points of the last settle, which a resize or
  a refresh also takes. Those can be stale, as when a slide resizes and the
  viewport does not, so on the copies the shift is measured afresh: the
  copy's box, its slide's and the viewport's. Measured in Chromium with 24
  slides and 48 copies: a press on the slides reads no box and takes about
  0.1ms; one that shifts takes 0.3 to 0.4ms, most of it the scroll.

**A wheel event on the copies moves the deck onto the slides too (amended
for #96).** Chained trackpad or wheel flicks press nothing, so the shift at
a press never came: each flick went on from the momentum of the one before,
the deck never rested, and it ran through the copies to an end of the
scroll range, on a Mac with a trackpad. Measured in Chromium with chained
synthetic trackpad gestures (CDP `synthesizeScrollGesture`), 14 flicks of
250px scrolled to the end of the range both ways.

So a wheel event along the axis, while the viewport is nearer a copy's snap
point than any slide's, shifts it a set as a press does, with the same
measure, the same snap points of the last settle and nothing shown or told.
Every such event shifts, momentum's included: the shift that comes first is
the earliest, and a flick's own events keep a set of copies ahead of it. A
wheel that scrolls nothing along the axis, as a vertical wheel over a
horizontal deck, shifts nothing, so it never stops a move the user did not
take over.

- Measured on a plain scroll-snap page before it was built, shifting at
  each wheel event while on the copies, snapping off for the instant:
  - Chromium, chained synthetic trackpad gestures: no frame moved against
    the gesture or by more than its own step, in 6 runs each at every event
    and at a gesture's first event only. Snapping put back mid-gesture
    snapped nothing. Once the compositor undid a shift, by exactly a set,
    which shows nothing, and the next event shifted again.
  - Firefox: Playwright's wheel steps one snap point at a time, with no
    animation, so the shift puts the deck on a snap point and nothing shows.
    Playwright cannot turn on Firefox's smooth or momentum scrolling.
  - Playwright's WebKit on Linux, each wheel event a smooth animation:
    snapping put back in the same task snapped the deck at once, a jump of
    30 to 141px with 300px slides; put back a frame later, or at the shift's
    own `scrollend`, it snapped nothing, but the shift cut the wheel's
    animation from 60 to 80px a frame to 15 to 25px for some 8 frames, a
    visible brake. Without any shift, that WebKit often rests a fast wheel
    stream off a snap point. It is not Safari.
- The maintainer checked the same page by hand on a Mac trackpad, in
  Safari and Chrome, on 2026-10-07, and saw no jump and no brake. The
  maintainer decided to shift at every wheel event.
- Snapping is put back at once, in the same task, as for a press. That was
  the cleanest in every engine measured but Linux WebKit, where neither
  timing was clean, and a later timing would leave the deck unsnapped for
  a while, which a gesture's end could then rest off a snap point.
- The shift's instant scroll ends with a `scrollend`, and in Chromium a
  `scrollsnapchange`, of its own, mid-gesture, with the viewport where the
  shift put it. That settled the deck mid-scroll: it measured every slide
  and copy, and started the wait for a re-snap. Now an end event there,
  before the user's scroll goes on, is the shift's, and is ignored. If the
  user's scroll goes no further, quiet settles the deck instead.
- Measured in Chromium, a mouse wheel's step (CDP `mouseWheel`) is
  scrolled, all but the browser's snap, before the page hears its event. A
  step back across the seam from the first slide is then already on the
  copies, and shifts at its own event. The browser's snap to the copy then
  went on and undid the shift, by exactly a set, which shows nothing; the
  deck rested on the copy and jumped off it as before, in the same frame,
  so the event log saw no jump. Its e2e check of a rest on a copy and the
  jump off it now uses an arrow key, which shifts nothing. A real mouse
  wheel's smooth scroll in Chromium could not be produced headless; check
  it by hand.
- Every wheel event runs it, so like a press it reads no layout box off the
  copies. Measured in Chromium with 24 slides and 48 copies: a wheel event
  on the slides reads no box and takes under 0.1ms, the timer's
  resolution; one that shifts reads three boxes and takes 0.4 to 0.6ms.

**A refused move comes back the short way.** A controlled deck whose parent
keeps `index` returns to it whichever way is shorter, across the seam when
that is shorter, whether or not the move it undoes crossed the seam: after a
step across the seam it comes back across it, rather than rewinding through
every slide. The engine's `scrollTo` takes a way, `direct` or `short`, for
this.

**Copies carry the outputs.** `--deck-slide-progress` (renamed by ADR-0010)
and `data-in-view` are written to every copy by its own place in the run, so a
copy in view reads as the slide it stands in for, and after the jump its slide
reads the same. Effects built on progress therefore draw copies as slides,
and the jump shows nothing.

**The jump lands on the slide's snap point, to the pixel.** Scroll positions
are whole pixels where the device pixel ratio is 1, and a set's length need
not be: with 3.5 centred slides in view a set of five is 428.57px. The copy
and its slide then sit at different fractions of a pixel, so the jump can
move the slides by up to half a pixel, plus layout's rounding to 1/64px.
No scroll position removes it, and it is under what a pixel shows. The
tests bound it.

**What loop does with the deck's other features:**

- Drag: a release projects onto the copies' snap points too, so a drag or
  flick crosses the seam and the jump follows the settle.
- Click to focus: a copy is inert, so a click on it reaches the viewport; the
  engine finds the copy under the pointer and moves to it across the seam.
- Autoplay: `next()` goes on from the last snap point to the first, so a
  looping deck's autoplay never stops at the end. It needs no change.
- Synced decks: the index is the slides', so a parent sharing it, as with
  thumbnails, sees a step across the seam as a move to slide 0.
- Fade: the copies stack with the slides over a snap target each, in the
  order they run, and crossfade by progress. They stay inert, as do the
  non-focal slides (ADR-0007).
- Curve: copies are curved by their progress like any slide (ADR-0008).
- Pages, vertical and right-to-left: the engine measures through `axisOf`,
  and a set's length along the axis is the distance from slide 0 to its copy
  after the slides.

**A deck whose slides all fit does not loop.** With a set no longer than the
viewport, a copy would show beside its own slide and the jump could land
past the end of the scroll range. The engine then reports one snap point,
and Viewport drops the copies, as Prev, Next, Dots and Counter drop for any
deck whose slides fit. Server HTML cannot measure, so it renders copies, and
hydration removes them where every slide fits: a layout shift of the kind
ADR-0003 already accepts for the controls.

The open checks of ADR-0006 still apply: VoiceOver reaching a copy, or a
flash at the seam in desktop Safari or on iOS, would reopen it. Firefox and
WebKit now run the e2e suite through Playwright, with mouse flicks (the
engine's scripted scroll) and wheel steps (the browser's own snapping)
across the seam both ways. Touch and momentum flicks across the seam are
out of reach of Playwright's desktop browsers; check touch by hand on a
phone. Trackpad flicks with the shift at a wheel event (#96) were checked
by hand in Safari and Chrome on a Mac, on the probe page; Firefox's
trackpad momentum, and the mouse wheel in Chrome and Safari, are still to
check. Open too (#48): the shift at a press is measured only in Chromium.
On an iPhone, check that a touch on the copies
mid-momentum shifts with no jump under the finger, that putting snapping
back with the finger down does not snap the deck, and that quick chained
swipes loop on in both directions.
