/** What a deck publishes: where it rests, and how many places it can rest. */
export interface DeckState {
  /** The current index: the snap point the viewport is resting at. */
  index: number;
  /** How many snap points the viewport has. One means every slide fits. */
  count: number;
  /** The current slide: the first slide resting at the current snap point. */
  slide: number;
  /** The focal slide: the slide nearest the snap alignment point, read from
   * the current slide's `scroll-snap-align`. Not the current slide where
   * several slides are in view; -1 if no slide snaps. */
  focal: number;
}

/** The axis a deck scrolls along. Horizontal follows the writing direction,
 * so in a right-to-left document the deck starts at the right. */
export type Orientation = 'horizontal' | 'vertical';

export interface DeckOptions {
  /** The snap point to start at, clamped to the snap points there are. */
  index: number;
  /** Defaults to horizontal. */
  orientation?: Orientation;
  /** Called when the current index, the snap point count, the current slide
   * or the focal slide changes: when a scroll settles, never during one. */
  onChange: (state: DeckState) => void;
}

export interface DeckEngine {
  /** Scrolls to a snap point, clamped to the snap points there are. Does
   * nothing for a non-finite index, or while there are no snap points. With
   * loop, `direct` (the default) goes within the slides, never round the
   * seam; `short` goes whichever way is shorter, across the seam if need be.
   * Without loop the two are the same. */
  scrollTo(index: number, way?: 'direct' | 'short'): void;
  next(): void;
  prev(): void;
  /** The snap point a scroll the engine started is heading to, until it
   * ends or the user's scroll takes over; null when none is in flight. */
  target(): number | null;
  /** Re-reads the snap points, as after slides are added or removed. Where
   * loop's copies or an effect's snap targets came or went, which moves the
   * snap points under the viewport, the deck keeps its current index: at
   * rest it goes back there at once, and a move in flight ends on its
   * target. */
  refresh(): void;
  /** Turns mouse drag on or off; on from the start. A drag already under way
   * finishes. */
  setDrag(enabled: boolean): void;
  /** Turns click-to-focus on or off; off from the start. On, a pointer click
   * on a slide scrolls to the snap point of its page: with one slide to a
   * page, where that slide is at the alignment point, or as near as the
   * scroll range allows. A click that ends a mouse drag never reaches it,
   * and a keyboard click is ignored. */
  setClickToFocus(enabled: boolean): void;
  /** Changes the axis the deck scrolls along, and re-reads the snap points
   * on it. */
  setOrientation(orientation: Orientation): void;
  destroy(): void;
}

/**
 * Tracks the snap point a native scroll container rests at and asks it to
 * move. The browser does the scrolling and snapping; the engine reads where
 * it settled from layout, so slide size, gap and alignment stay plain CSS.
 *
 * The slides are the viewport's children, except snap targets and copies
 * (see `slidesOf`): where an effect stacks the slides in one place, an empty
 * snap target per slide lays out along the axis in its stead, and the engine
 * measures each slide by its target.
 *
 * Loop (clone and jump, ADR-0006, as built in ADR-0009): where the viewport
 * holds a copy of every slide before the slides and another after them, each
 * marked `data-carouseldeck-copy` (`before` or `after`; DOM order does not
 * matter), scrolling past the last snap point arrives at the first, and
 * back. The copies are the caller's to render, inert and `aria-hidden`. Only
 * the slides' snap points are counted: a step across the seam scrolls on
 * onto the copies, and when the viewport comes to rest on a copy's snap
 * point the engine jumps it, instantly, a set of slides back onto the
 * identical slide's snap point. Never mid-motion: a jump then would show and
 * stop momentum. But a touch or pen pressed on the copies, a mouse drag
 * starting there, or a wheel event there along the axis, moves the deck a
 * set onto the slides at once, where nothing shows, so swipes and trackpad
 * or wheel flicks chained faster than the deck rests never run out of
 * copies (see `shiftOffCopies`). A set of slides no longer than the
 * viewport has nothing to loop: the engine then reports one snap point, as
 * for any deck whose slides all fit, and the caller should drop the copies.
 *
 * It also writes to each slide, and each copy, for CSS to read, once a
 * frame while the viewport scrolls and whenever it settles, never through
 * `onChange` (ADR-0003):
 *
 * - `--deck-slide-progress`: the slide's progress, its signed distance from the
 *   focal position in slides. 0 at the focal position, -1 one slide before
 *   it, 2.25 two and a quarter slides after it, the way the deck runs, so a
 *   vertical or right-to-left deck reads the same. The focal position is the
 *   snap alignment point of the slide resting at the current snap point (see
 *   `DeckState.focal`), placed between the slides by where their own
 *   alignment points are: with a slide exactly at the focal position, every
 *   slide's progress is a whole number whatever the gap. Where the scroll
 *   range keeps the focal slide from reaching it, as at either end of a
 *   centred deck, progress stays fractional at rest. Measured from the
 *   slides' boxes as they are drawn (their snap targets', where there are
 *   any), so an effect should not move a slide's alignment point: scale
 *   about it (`transform-origin`), not away from it.
 * - `data-in-view`: present on each slide with at least one pixel inside the
 *   viewport's scrollport, partly in view included. It hides nothing.
 */
export function createDeck(
  viewport: HTMLElement,
  options: DeckOptions
): DeckEngine {
  // Not a reachable state, so the first settle always publishes.
  let state: DeckState = { index: -1, count: 0, slide: -1, focal: -1 };

  const publish = (next: DeckState) => {
    if (
      next.index === state.index &&
      next.count === state.count &&
      next.slide === state.slide &&
      next.focal === state.focal
    ) {
      return;
    }
    state = next;
    options.onChange(state);
  };

  let vertical = options.orientation === 'vertical';
  // Read afresh for each use: an ancestor's `dir` can change at any time.
  const axis = () => axisOf(viewport, vertical);

  // The deck's snap alignment, read at each settle from the slide resting at
  // the snap point: a slide that does not snap, as within a page, has none.
  // Progress is measured from it; with no slide snapping, from the start.
  let align = 'start';

  // Progress and in-view, written at most once a frame while scrolling.
  let frame = 0;
  const paint = (along = axis()) => {
    cancelAnimationFrame(frame);
    frame = 0;
    writeProgress(viewport, along, align);
  };

  // Whether the viewport holds loop's copies and an effect's snap targets,
  // as of the last settle or refresh (see `shapeOf`).
  let shape = '';
  // The snap points as of the last settle, for a press to read where the
  // deck is without measuring (see `shiftOffCopies`).
  let known: Geometry = { points: [], slides: [], length: 0, sets: 0 };

  const settle = () => {
    refreshOwed = false;
    shifted = null;
    userInput = false;
    userScroll = false;
    shape = shapeOf(viewport);
    placeOwed = null;
    const along = axis();
    layoutShells(viewport, along);
    alignCopies(viewport);
    const geometry = snapPoints(viewport, along);
    known = geometry;
    jumpOffCopies(along, geometry);
    // Its own settle reports where the deck comes to rest.
    if (resnap(along, geometry)) return;
    const { points, slides } = geometry;
    const index = indexAt(geometry, along.position);
    const slide = slides.indexOf(index);
    const run = slidesOf(viewport);
    align =
      slide === -1 ? 'start' : along.snapAlign(run.boxes[run.first + slide]);
    paint(along);
    publish({
      index,
      count: points.length,
      slide,
      focal: slide === -1 ? -1 : focalSlide(viewport, along, align)
    });
  };

  // Resting on a copy, jump one set of slides onto the identical slide: only
  // on a snap point, as the browser would snap a jump that lands off one,
  // which shows (ADR-0006). The copy's rest is measured, as the browser
  // rests it: WebKit can rest a copy a pixel or two off its slide's rest
  // plus a set's length.
  const jumpOffCopies = (along: Axis, geometry: Geometry) => {
    if (geometry.length === 0) return;
    const at = along.position;
    const { slides, boxes, first } = slidesOf(viewport);
    const restOf = snapRest(viewport, along, false);
    const near = (box: Element) => {
      const rest = restOf(box);
      return rest !== null && Math.abs(rest - at) <= 1;
    };
    const own = (i: number) => i >= first && i < first + slides.length;
    if (boxes.some((box, i) => own(i) && near(box))) return;
    const copy = boxes.findIndex((box, i) => !own(i) && near(box));
    if (copy === -1) return;
    const point = geometry.slides[wrap(copy - first, slides.length)];
    if (point !== -1) {
      jumping = true;
      along.scrollTo(geometry.points[point], 'instant');
    }
  };

  // A touch or pen pressed on the viewport, or a mouse drag as it starts,
  // or a wheel event along the axis, while it is on the copies, nearer a
  // copy's snap point than any slide's, moves it a set onto the slides at
  // once, to the same place among them (ADR-0009, amended for #48 and #96).
  // Swipes or trackpad flicks chained faster than the deck comes to rest are
  // one long scroll with no settle to jump at, and would run through the
  // copies to an end of the scroll range; now each swipe starts with a full
  // set of copies ahead of it, and a flick's own wheel events keep one
  // ahead. The slides show what the copies did, so nothing shows: the
  // shift's scroll paints progress and in-view before the frame that draws
  // it, and nothing is published. A mouse click scrolls nothing, and a tap
  // leaves a move going, so neither shifts: the move ends on its target and
  // jumps there as ever. A pan or a drag takes the move over first.
  //
  // Every press and wheel event runs it, so it reads no layout off the
  // copies: where the deck is is read against the snap points of the last
  // settle. Those can be stale, as when a slide resizes and the viewport
  // does not, so on the copies the shift is measured afresh, from the
  // copy's own rest to its slide's, as `jumpOffCopies` measures: WebKit can
  // rest a copy a pixel or two off its slide's rest plus a set's length.
  // Returns where the shift put the deck, or null if it did not shift.
  const shiftOffCopies = () => {
    const { points, length, sets } = known;
    const count = points.length;
    if (move || length === 0 || count === 0) return null;
    const along = axis();
    const at = along.position;
    let nearest = 0;
    const distance = (i: number) => Math.abs(positionOf(known, i) - at);
    for (let i = -sets * count; i < (sets + 1) * count; i++) {
      if (distance(i) < distance(nearest)) nearest = i;
    }
    const set = Math.floor(nearest / count);
    if (set === 0) return null;
    const point = nearest - set * count;
    const slide = known.slides.indexOf(point);
    const { slides, boxes, first } = slidesOf(viewport);
    const own = boxes[first + slide];
    const copy = boxes[first + slide + set * slides.length];
    if (slide === -1 || !own || !copy) return null;
    // One read of the viewport for both: the slide's rest is clamped to the
    // scroll range, as `snapPoints` has it.
    const restOf = snapRest(viewport, along, false);
    const to = restOf(own);
    const from = restOf(copy);
    if (to === null || from === null) return null;
    const shift = Math.min(Math.max(to, 0), along.max()) - from;
    // Snapping off for the shift, as the browser would snap it, which shows;
    // a drag has it off already. Measured in Chromium, snapping put back
    // while a finger is down, or mid wheel gesture, snaps nothing.
    const { style } = viewport;
    const snap = style.scrollSnapType;
    style.scrollSnapType = 'none';
    along.scrollTo(at + shift, 'instant');
    style.scrollSnapType = snap;
    // Positions kept from before the shift move with it.
    if (drag === 'dragging') dragAt += shift;
    if (taken) taken.at += shift;
    if (resnapFrom !== null) resnapFrom += shift;
    return at + shift;
  };

  // Where snap point `index` rests, as measured: with loop, a copy's from
  // the copy's own box (see `jumpOffCopies`).
  const restAt = (along: Axis, geometry: Geometry, index: number) => {
    const count = geometry.points.length;
    const set = Math.floor(index / count);
    if (set === 0 || geometry.length === 0) return positionOf(geometry, index);
    const slide = geometry.slides.indexOf(index - set * count);
    const { slides, boxes, first } = slidesOf(viewport);
    const box = boxes[first + slide + set * slides.length];
    const rest = slide === -1 || !box ? null : snapRest(viewport, along)(box);
    return rest ?? positionOf(geometry, index);
  };

  // At rest off every snap point under mandatory snapping, move to a snap
  // point, as the browser would have snapped it (ADR-0006): a long task can
  // leave the deck there, and the browser never snaps it back. The nearest
  // one, or where the user's scroll took a move over, the nearest the way
  // that scroll went: the browser can carry the move's scroll on after it,
  // and stop part way back toward the move's target. Where quiet ended a
  // move short, the nearest the way the move went: its scroll may go on.
  // With loop, the copies' snap points count, and the move's settle jumps
  // off a copy as ever. Only
  // once quiet confirms the deck is still there: an end event can come late,
  // as the browser's own snap begins. Never while the user has the deck: a
  // pointer pressed on it, a drag, or a scroll still going, which only an end
  // event tells apart from a finger held still. Not with proximity snapping,
  // where resting between snap points is the browser's own choice. Where the
  // browser still holds the deck off the snap points as measured, a re-snap
  // from there moves nothing, and the deck settles there at the next try.
  // Returns whether the settle waits: for quiet, or for the move it started.
  let resnapFrom: number | null = null;
  // Waiting for quiet to confirm a re-snap, then due once it has.
  let confirm: 'waiting' | 'due' | null = null;
  const resnap = (along: Axis, geometry: Geometry) => {
    const at = along.position;
    const count = geometry.points.length;
    if (count === 0) return false;
    const reach = geometry.length > 0 ? geometry.sets * count : 0;
    const indexes = Array.from(
      { length: count + 2 * reach },
      (_, i) => i - reach
    );
    // Each slide's and copy's rest as measured: a copy's can differ from
    // its slide's by a set's length by a pixel or two of rounding. A copy's
    // past an end of the scroll range, as a centred deck's last copies' are,
    // is no rest: the browser rests it at the end, but the deck could not
    // jump off it, as its slide a set back would rest on no snap point
    // (#48). So a deck there re-snaps to one within the scroll range.
    const restOf = snapRest(viewport, along);
    const copyRestOf = snapRest(viewport, along, false);
    const { slides, boxes, first } = slidesOf(viewport);
    if (
      boxes.some((box, i) => {
        const own = i >= first && i < first + slides.length;
        const rest = (own ? restOf : copyRestOf)(box);
        return rest !== null && Math.abs(rest - at) <= 1;
      })
    ) {
      resnapFrom = null;
      taken = null;
      confirm = null;
      return false;
    }
    if (
      !hasScrollEnd ||
      drag !== 'idle' ||
      !getComputedStyle(viewport).scrollSnapType.includes('mandatory') ||
      (resnapFrom !== null && Math.abs(at - resnapFrom) < 1)
    ) {
      confirm = null;
      return false;
    }
    // The last pointer to let go settles the deck again.
    if (pressed.size > 0) {
      settleOwed = true;
      confirm = null;
      return false;
    }
    if (confirm !== 'due') {
      confirm = 'waiting';
      awaitQuiet();
      return true;
    }
    confirm = null;
    const way = taken ? taken.way || Math.sign(at - taken.at) : 0;
    const rest = (i: number) => restAt(along, geometry, i);
    const distance = (i: number) => Math.abs(rest(i) - at);
    const ahead = (i: number) => (rest(i) - at) * way > 1;
    const reached = indexes.filter((i) => reachable(geometry, along, i));
    const onward = reached.filter(ahead);
    const nearest = (onward.length > 0 ? onward : reached).reduce((a, b) =>
      distance(b) < distance(a) ? b : a
    );
    resnapFrom = at;
    scrollTo(nearest, true);
    return move !== null;
  };

  // The engine's move, a scroll it started (ADR-0006): null when idle, or
  // moving to `target`, the snap point it heads to, until it ends or the
  // user's scroll takes over. A second press steps on from the target, not
  // from where the viewport last rested. With loop it may be a set of slides
  // past either end, on the copies there (see `positionOf`). `stalled` once
  // a quiet has found it short of its target, until its next scroll event.
  // `startMove` and `endMove` below own it, with the quiet that ends it.
  let move: { target: number; stalled: boolean } | null = null;
  // The way a re-snap goes (see `resnap`): from where the user's scroll took
  // a move or the wait for a re-snap over, and the way it went along the
  // axis, 1 or -1, where the input says; 0 where it does not, as for a touch
  // pan. Or the way a move quiet ended short went. Until the deck next rests
  // on a snap point, or a new move starts.
  let taken: { at: number; way: number } | null = null;
  // The move has arrived: the viewport is at its target, its end not seen.
  const arrived = ({ target }: { target: number }) => {
    const along = axis();
    const geometry = snapPoints(viewport, along);
    return Math.abs(along.position - restAt(along, geometry, target)) < 1;
  };

  // Mouse drag (ADR-0006): see the pointer handlers below.
  let dragEnabled = true;
  let drag: 'idle' | 'dragging' | 'releasing' = 'idle';
  // The mouse button pressed on the viewport, until it lets go; -1 if none.
  let pointer = -1;
  let startX = 0;
  let startY = 0;
  // The axis a drag moves along, fixed when the button is pressed.
  let dragAxis = axis();
  // Where the pointer last was along it.
  let last = 0;
  // How far the pointer has dragged the deck forward, in scroll pixels.
  let travel = 0;
  // Where the drag has put the deck, as the browser clamped it. The drag
  // goes on, and is released, from here, not from where the viewport is:
  // measured in Playwright's WebKit under load (#123), the browser's own
  // handling of the mouse press can scroll the viewport back between the
  // drag's moves, and the deck came to rest where the drag began. But it
  // never fights the user (ADR-0006): where the user scrolls the deck by
  // other means mid-drag, a wheel or a key, or a new layout moves it, the
  // drag goes on from where the viewport is (see `followViewport`).
  let dragAt = 0;
  // Until when the drag reads where it is from the viewport, or null: it
  // reads it at least once after `followViewport`.
  let follow: number | null = null;
  // For `ms`: the user's wheel or key scrolls for a while after its event;
  // a new layout's scroll is done by the drag's next move or its release.
  const followViewport = (ms: number) => {
    if (drag !== 'dragging') return;
    follow = Math.max(follow ?? 0, performance.now() + ms);
  };
  const dragPosition = () => {
    if (follow !== null) {
      dragAt = dragAxis.position;
      if (performance.now() > follow) follow = null;
    }
    return dragAt;
  };
  let samples: { t: number; travel: number }[] = [];
  // A move asked for while the pointer held the deck.
  let deferred: { index: number; across: boolean } | null = null;
  // The viewport's inline styles a drag overrides, while it does.
  let saved: { snap: string; select: string } | null = null;

  const removeSnap = () => {
    if (saved) return;
    const { style } = viewport;
    saved = { snap: style.scrollSnapType, select: style.userSelect };
    style.scrollSnapType = 'none';
    // No text selection follows the pointer across the slides.
    style.userSelect = 'none';
  };
  const restoreSnap = () => {
    if (!saved) return;
    const { style } = viewport;
    // A value the consumer set mid-drag is newer than the saved one, and
    // React would not set it again.
    if (style.scrollSnapType === 'none') style.scrollSnapType = saved.snap;
    if (style.userSelect === 'none') style.userSelect = saved.select;
    saved = null;
  };

  // Set by any scroll, cleared when it ends. A position read mid-scroll is
  // not a settled one, so a refresh then waits for the scroll's end.
  let scrolling = false;
  // Quiet (ADR-0006): a scroll has ended once no scroll event has come for
  // this long. It ends every scroll where `scrollend` is missing, and a move
  // in every engine, as the move's end event may never come. A move short of
  // its target ends only at a second quiet with no scroll between: the
  // first can come just after a long task held the main thread, before the
  // browser has gone on with the scroll, or sent its scroll events.
  //
  // A quiet that would find a scroll stopped, a move's short of its target
  // or the one a re-snap waits on, waits for a frame to render with no
  // scroll event first (#123). Measured in Playwright's WebKit under load,
  // no frame renders for 300ms and more while the main thread is idle and
  // timers run, and a scroll in flight goes nowhere until frames come back.
  // Quiet then took the move for stalled and re-snapped it short of its
  // target, or took a keyboard scroll's early `scrollend` for its end and
  // re-snapped the deck back. A hidden document renders no frame, so there
  // quiet decides at once, and a move in a background tab still settles.
  const hasScrollEnd = 'onscrollend' in window;
  let quiet: ReturnType<typeof setTimeout> | undefined;
  let quietFrame = 0;
  const stopQuiet = () => {
    clearTimeout(quiet);
    cancelAnimationFrame(quietFrame);
    quietFrame = 0;
  };
  const awaitQuiet = () => {
    stopQuiet();
    quiet = setTimeout(onQuiet, SCROLL_END_DEBOUNCE_MS);
  };
  const onQuiet = () => {
    const short = move !== null && !arrived(move);
    if (
      (!short && confirm !== 'waiting') ||
      viewport.ownerDocument.visibilityState === 'hidden'
    ) {
      quieted(false);
      return;
    }
    // A scroll event before the frame awaits quiet again, which cancels it.
    quietFrame = requestAnimationFrame(() => {
      quietFrame = 0;
      quieted(short);
    });
  };
  const quieted = (short: boolean) => {
    if (short && move && !move.stalled) {
      move.stalled = true;
      awaitQuiet();
      return;
    }
    relaidAt = null;
    // Input with no scroll since is not the user's scroll: a scroll after
    // this quiet is not taken for one.
    if (!userScroll) userInput = false;
    if (confirm === 'waiting') confirm = 'due';
    // Nothing scrolled since the last end, or a scroll the engine did not
    // start, which ends at its own end event: but one a refresh found going
    // ends here, unless it is the user's (see `refreshOwed`), and so does
    // one whose end a wheel's shift took for its own (see `shifted`).
    else if (
      !move &&
      !shifted?.ended &&
      (!scrolling || (hasScrollEnd && (!refreshOwed || userScroll)))
    ) {
      refreshOwed = false;
      return;
    }
    scrollEnded();
  };
  const onScroll = () => {
    frame ||= requestAnimationFrame(() => paint());
    // The scroll a refresh's new layout makes, to where it settled the
    // deck, is no scroll (see `relaidAt`).
    if (
      relaidAt !== null &&
      !move &&
      Math.abs(axis().position - relaidAt) < 1
    ) {
      return;
    }
    scrolling = true;
    if (userInput) userScroll = true;
    // The user's scroll goes on from the shift: its end is to come.
    if (shifted && Math.abs(axis().position - shifted.at) >= 1) shifted = null;
    if (move) move.stalled = false;
    if (!hasScrollEnd || move || confirm || refreshOwed) awaitQuiet();
  };
  // A scroll whose end event never comes must not leave `scrolling` set for
  // good: a refresh would then only paint, a settle owed to a pointer would
  // be dropped and a new layout would not keep the deck's place, so its
  // count and a controlled `index` go stale (#87). Chromium sends no
  // `scrollend` for the scroll a shorter scroll range makes, as when slides
  // are removed from under the viewport, only a `scrollsnapchange`, and
  // after a touch fling on another scroller was cut short, as when a page
  // leaves mid-fling, not even that. So a refresh that settles notes where,
  // until the next quiet: a scroll to there is the new layout's, and leaves
  // the deck at rest. A refresh that finds a scroll going, neither a move
  // nor the user's, settles at its end event or at quiet, whichever comes
  // first. The user's scroll is never cut short: it settles at its own end.
  let relaidAt: number | null = null;
  let refreshOwed = false;
  // Where a wheel's shift put the deck (see `onWheel`), until the user's
  // scroll goes on from there or the deck settles. The shift's instant
  // scroll ends with an end event of its own, mid-scroll, which must not
  // settle the deck: an end there is taken for it (`ended`). If the user's
  // scroll then goes no further, quiet ends it instead.
  let shifted: { at: number; ended: boolean } | null = null;
  // The user's input, until the next quiet or settle, and whether a scroll
  // followed it, until the next settle: input that scrolls nothing, as a
  // vertical wheel over a horizontal deck, leaves a refresh owed to settle
  // at quiet, and makes no later scroll the user's.
  let userInput = false;
  let userScroll = false;
  // Whether the engine's own jump off a copy (`jumpOffCopies`) has a scroll
  // still pending with the browser: set where it starts that scroll,
  // cleared once it ends (`scrollEnded`) or the user takes the deck over
  // (`takeOver`). `keepPlace` reads it to tell the jump apart from anyone
  // else's scroll, the page's own included, which stands like the user's.
  let jumping = false;
  // The layout moved the snap points while something the engine started was
  // still settling (see `keepPlace`): a move in flight, or the jump still
  // pending (`jumping`). A move rests on its target once it ends; the jump
  // rests on the current index instead, as `keepPlace` would have put it at
  // once, had the jump's scroll not still been going (#146). `startMove` and
  // `endMove` clear it, as a new move's target, or the user's own scroll
  // taking over, counts the new snap points.
  let relaidOut = false;
  const startMove = (target: number) => {
    move = { target, stalled: false };
    relaidOut = false;
    taken = null;
    confirm = null;
    awaitQuiet();
  };
  // Ends the move, if any, without a settle. Where `scrollend` is there, a
  // scroll the engine did not start ends at its own end event, not quiet.
  const endMove = () => {
    move = null;
    relaidOut = false;
    // Quiet still ends the window after a refresh (see `relaidAt`).
    if (hasScrollEnd && relaidAt === null) stopQuiet();
  };
  // The user's scroll ends the move, if any, going `way` along the axis
  // where the input says. It also ends the wait for a re-snap, and its way
  // is the one a re-snap then goes: the user's scroll settles at its own
  // end.
  const takeOver = (way = 0) => {
    if (move || confirm) taken = { at: axis().position, way };
    confirm = null;
    userInput = true;
    jumping = false;
    endMove();
    // Quiet still ends what a refresh is owed, if this input scrolls
    // nothing, and ends the input.
    if (!userScroll) awaitQuiet();
  };

  // Pointers pressed on the viewport, by id, with their type, until they
  // let go. While one is down the deck does not settle, so it never jumps
  // off a copy under a finger or the mouse; the settle waits for the last
  // to let go. A release must never go unheard, or the deck would never
  // settle again: the window hears every pointerup and pointercancel first,
  // before any listener can stop it; a pointer that moves or comes over
  // anything with no button down has let go; losing focus lets go of all,
  // as the release may then come to another window; and a primary pointer
  // pressed lets go of any other of its type, as none can still be down.
  const pressed = new Map<number, string>();
  let settleOwed = false;
  // The layout moved the snap points while a pointer held the deck (see
  // `keepPlace`): the snap point the deck goes back to once it lets go, its
  // current index or a move's target. Any settle before then clears it.
  let placeOwed: number | null = null;
  // Lets go of pointer `id`, or of every pointer.
  const letGo = (id?: number) => {
    if (id === undefined) pressed.clear();
    else if (!pressed.delete(id)) return;
    payOwed();
  };
  // Whether the browser sends touch events: then a touch lets go when the
  // last finger lifts, not at the `pointercancel` that hands its pan to the
  // browser. The finger is still down then, and the pan has sent no scroll
  // yet, so a settle owed would jump off a copy under the finger, and
  // report, as the pan begins (#48). The pan settles at its own end.
  const touchEvents = 'ontouchstart' in window;
  const onTouchEnd = (event: TouchEvent) => {
    for (const touch of event.changedTouches) {
      if ((touch as StylusTouch).touchType === 'stylus') liftPen();
    }
    if (event.touches.length > 0) return;
    unholdTouch();
    let held = false;
    for (const [id, type] of pressed) {
      if (type === 'touch') held = pressed.delete(id);
    }
    if (held) payOwed();
  };
  // A touch's `touchend` goes to the node it began on, and never reaches
  // the window if that node has left the page, as when a consumer swaps a
  // slide's content mid-pan. The node itself still hears it.
  let touched: EventTarget | null = null;
  const unholdTouch = () => {
    for (const type of ['touchend', 'touchcancel']) {
      touched?.removeEventListener(type, onTouchEnd as EventListener);
    }
    touched = null;
  };
  const holdTouch = (target: EventTarget | null) => {
    unholdTouch();
    if (!touchEvents || !target) return;
    touched = target;
    for (const type of ['touchend', 'touchcancel']) {
      target.addEventListener(type, onTouchEnd as EventListener);
    }
  };
  // A pen the browser pans, as a touch, lets go when it lifts, not at the
  // `pointercancel` that hands its pan to the browser (#97): a settle owed
  // would jump off a copy under the pen, and report, as the pan begins. The
  // browser sends none of the pen's events after the cancel, its `pointerup`
  // included, so it lets go at the first of: the lift of a touch that is the
  // pen's own, as Safari marks Apple Pencil's (`touchType` 'stylus'), never
  // a finger's; the lifted pen hovering, with no button down, under any
  // pointer id; any other way a pointer lets go (`onWindowPointer`); or, as
  // the pen may lift with none of these, a bounded wait from the cancel. The
  // pan's `scrollend` is no lift: the shift off the copies at the cancel
  // ends with one of its own.
  let penPan: ReturnType<typeof setTimeout> | null = null;
  const liftPen = () => {
    if (penPan === null) return;
    clearTimeout(penPan);
    penPan = null;
    let held = false;
    for (const [id, type] of pressed) {
      if (type === 'pen') held = pressed.delete(id);
    }
    if (held) payOwed();
  };
  const payOwed = () => {
    if (pressed.size > 0 || !(settleOwed || placeOwed !== null)) return;
    const place = placeOwed;
    settleOwed = false;
    placeOwed = null;
    // A scroll since, as a touch pan, settles at its own end.
    if (scrolling || move || drag === 'dragging') return;
    if (place === null) settle();
    else restOn(place);
  };
  const onWindowPointer = (event: PointerEvent) => {
    if (event.type === 'pointercancel') {
      if (event.pointerType === 'touch' && touchEvents) return;
      if (event.pointerType === 'pen') {
        if (penPan !== null) clearTimeout(penPan);
        penPan = setTimeout(liftPen, PEN_LIFT_MS);
        return;
      }
    }
    // A hovering pen may come back under another id than the panned one's.
    if (event.pointerType === 'pen' && event.buttons === 0) liftPen();
    if (
      event.type === 'pointerup' ||
      event.type === 'pointercancel' ||
      event.buttons === 0
    ) {
      letGo(event.pointerId);
    }
  };
  const onBlur = () => letGo();
  const WINDOW_POINTER = [
    'pointerup',
    'pointercancel',
    'pointermove',
    'pointerover'
  ] as const;

  const scrollEnded = () => {
    // The pointer, not the browser, says where a drag ends.
    if (drag === 'dragging') return;
    // A drag's release rests on its snap point now: snapping can come back
    // without moving it.
    if (drag === 'releasing') {
      drag = 'idle';
      restoreSnap();
    }
    scrolling = false;
    jumping = false;
    // A new layout may have moved the snap points under a move or the jump
    // still going (`relaidOut`): rest on the move's target, or the jump's,
    // the current index.
    let target: number | null = null;
    if (relaidOut) {
      target = move ? wrap(move.target, state.count) : state.index;
    }
    // Quiet ended the move short of its target: a re-snap goes on its way,
    // as the browser may still be scrolling there (`resnap`).
    if (target === null && move && !arrived(move)) {
      const along = axis();
      const to = positionOf(snapPoints(viewport, along), move.target);
      taken = { at: along.position, way: Math.sign(to - along.position) };
    }
    endMove();
    if (pressed.size > 0) {
      if (target === null) settleOwed = true;
      else placeOwed = target;
      return;
    }
    if (target === null) settle();
    else restOn(target);
  };

  // `scrollend` and `scrollsnapchange` end a move only once it has arrived.
  // Before that, an end is not the move's: it is the late end of an earlier
  // scroll, which Chromium sends a few milliseconds after the viewport
  // arrives, after a move started in those milliseconds, or of a scroll that
  // interrupted the move; or `scrollsnapchange` as the move begins. Quiet
  // ends the move then.
  const onEnd = () => {
    if (move && !arrived(move)) return;
    if (shifted && Math.abs(axis().position - shifted.at) < 1) {
      shifted.ended = true;
      awaitQuiet();
      return;
    }
    scrollEnded();
  };

  // The user's scroll ends a move without a settle: the scroll in flight
  // ends as the user's, and nothing the engine asked for resumes. A wheel,
  // a key that scrolls, a touch or pen pan, which the browser takes over
  // with `pointercancel`, and a mouse drag (below). Focus entering a slide
  // scrolls it into view, so it is the user's scroll too, and the deck goes
  // on to it (below). Input that scrolls nothing leaves the move going: a
  // click, even one that focuses a control in another slide, Enter, and a
  // key in a text field or one the page has prevented. Focus within a slide
  // or on the viewport, as Tab out of a slide gives, scrolls, but the move
  // resumes to its target (below).
  // `at` reads a wheel's delta along the axis, signed the way the deck
  // runs, as it reads a point: the way the wheel scrolls the deck.
  //
  // A wheel event along the axis on the copies shifts the deck a set onto
  // the slides (#96): chained trackpad or wheel flicks press nothing, each
  // goes on from the momentum of the one before, and the deck would never
  // rest to jump off a copy. A wheel that scrolls nothing along the axis, as
  // a vertical wheel over a horizontal deck, shifts nothing.
  const onWheel = (event: WheelEvent) => {
    const way = Math.sign(
      axis().at({ clientX: event.deltaX, clientY: event.deltaY })
    );
    takeOver(way);
    if (way === 0) return;
    followViewport(USER_SCROLL_MS);
    const at = shiftOffCopies();
    if (at !== null) shifted = { at, ended: false };
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || !SCROLL_KEYS.has(event.key)) return;
    const on = event.target;
    if (
      on instanceof HTMLElement &&
      (on.isContentEditable ||
        on.matches('input, textarea, select') ||
        // Space presses a button rather than scroll.
        (event.key === ' ' && on.matches('button, summary')))
    ) {
      return;
    }
    takeOver();
    followViewport(USER_SCROLL_MS);
  };
  const onPointerCancel = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') {
      takeOver();
      // The browser takes the press over as a pan, and the pan any move.
      // Measured in Chromium, a fling goes on past the press until then,
      // and undoes a shift made at the press.
      shiftOffCopies();
    }
    onPointerUp(event);
  };
  // Focus in the viewport during a move scrolls the focus into view, and in
  // Chromium that stops the move's scroll where it is (ADR-0006). Focus
  // entering a slide from outside it, as Tab does, is the user's: focus
  // wins, and the move is replaced by one to the snap point of the focused
  // slide's page, so the deck rests with the focus in view. Focus within a
  // slide or on the viewport is not: the move goes on to its own target.
  // Either way the move's scroll starts again two frames on: the browser
  // scrolls the focus into view after this event, and Chromium ignores a
  // smooth scroll asked for until a frame after that, to the stopped
  // scroll's target above all. A looping move's target may be on the
  // copies, so the scroll may go across the seam. A new move's target is
  // set now, so the end of the stopped scroll is a late one. A pointer
  // pressed on the viewport, as a mouse pressing a control in a slide, is a
  // click: it leaves the move going.
  let focusFrame = 0;
  const resume = () => {
    const focused = move;
    cancelAnimationFrame(focusFrame);
    focusFrame = requestAnimationFrame(() => {
      focusFrame = requestAnimationFrame(() => {
        if (focused && move === focused) scrollTo(focused.target, true);
      });
    });
  };
  const onFocusIn = (event: FocusEvent) => {
    if (!move || pressed.size > 0) return;
    let slide = event.target instanceof Element ? event.target : null;
    while (slide && slide.parentElement !== viewport) {
      slide = slide.parentElement;
    }
    const from = event.relatedTarget;
    if (!slide || (from instanceof Node && slide.contains(from))) {
      resume();
      return;
    }
    const { slides: own, boxes, first } = slidesOf(viewport);
    const index = own.indexOf(slide);
    if (index === -1) return;
    const along = axis();
    const geometry = snapPoints(viewport, along);
    const owner = pageOwner(viewport, along, geometry.slides, index);
    // A slide in no page, as one before the first snap point where the
    // slides snap to their start, goes to the snap point nearest its start,
    // so the deck still rests on a snap point.
    const target =
      owner === -1
        ? indexAt(
            geometry,
            along.position +
              alignOffset(along, along.view(), boxes[first + index], 'start')
          )
        : geometry.slides[owner];
    startMove(target);
    resume();
  };

  const refresh = () => {
    followViewport(0);
    layoutShells(viewport, axis());
    alignCopies(viewport);
    // Loop's copies or an effect's snap targets came or went, as when `loop`
    // or an effect changes on a mounted deck: the snap points moved under
    // the viewport, and where the browser puts it then is no snap point of
    // the deck's own choosing. Noted at once, so a later refresh, as the
    // resize the new layout can bring, does not count it twice.
    const next = shapeOf(viewport);
    if (next !== shape) {
      shape = next;
      if (keepPlace()) return;
    }
    if (!scrolling && !move && drag !== 'dragging') {
      settle();
      relaidAt = axis().position;
      awaitQuiet();
    } else {
      paint();
      // A move settles at its own end, and so do a drag and the user's
      // scroll (see `relaidAt`).
      if (!move && drag === 'idle' && !userScroll) {
        refreshOwed = true;
        awaitQuiet();
      }
    }
  };

  // `across` lets a looping deck's move run past either end onto the copies
  // there, as a step across the seam does; otherwise it stays on the slides.
  const scrollTo = (index: number, across = false) => {
    // The pointer holds the deck: go there once it lets go.
    if (drag === 'dragging') {
      deferred = { index, across };
      return;
    }
    const along = axis();
    const geometry = snapPoints(viewport, along);
    const count = geometry.points.length;
    // Nowhere to scroll to: a move started now would never arrive either.
    if (!Number.isFinite(index) || count === 0) return;
    let next = across && geometry.length > 0 ? index : clamp(index, count);
    // A loop has no end, but a move can only run as far as the copies: a
    // move past them, as when presses come faster than the deck moves, goes
    // to the same slide's nearest copy, or the slide, ahead of the viewport
    // the way the move goes. Where none is ahead, as when presses come about
    // as fast as the deck moves and the viewport has overtaken them, it goes
    // to the furthest snap point ahead the copies reach, and a press beyond
    // that is dropped. So the deck passes fewer slides than were pressed, but
    // never moves against a press, never jumps mid-motion, and only ever
    // goes where it reports it rests (ADR-0009). Ahead means at least half
    // a snap point on: the viewport as read can trail the scroll by a frame.
    // A copy's snap point past either end of the scroll range, as a centred
    // deck's last copies' are, is out of reach like one past the copies.
    if (across && geometry.length > 0 && !reachable(geometry, along, next)) {
      const at = along.position;
      const ahead = Math.sign(positionOf(geometry, next) - at) || 1;
      const margin = geometry.length / count / 2;
      const distance = (i: number) => (positionOf(geometry, i) - at) * ahead;
      const { sets } = geometry;
      const onward = Array.from({ length: 2 * sets + 1 }, (_, i) => i - sets)
        .map((set) => wrap(next, count) + set * count)
        .filter((i) => reachable(geometry, along, i) && distance(i) > margin);
      if (onward.length > 0) {
        next = onward.reduce((a, b) => (distance(b) < distance(a) ? b : a));
      } else {
        let furthest = ahead > 0 ? (sets + 1) * count - 1 : -sets * count;
        while (!reachable(geometry, along, furthest)) furthest -= ahead;
        // Already there, or heading there: the press is dropped.
        if (furthest === move?.target || distance(furthest) <= margin) {
          return;
        }
        next = furthest;
      }
    }
    const to = restAt(along, geometry, next);
    // A scroll to where the viewport already rests is no move: there is
    // nowhere to go.
    if (!move && Math.abs(along.position - to) < 1) return;
    // A move in flight, arrived or not, is superseded: it never settles.
    startMove(next);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    along.scrollTo(to, reduce ? 'instant' : 'smooth');
  };

  // Rests the viewport, instantly, on snap point `index`, clamped, and
  // settles.
  const restOn = (index: number) => {
    const along = axis();
    const { points } = snapPoints(viewport, along);
    const to = points[clamp(index, points.length)] ?? 0;
    if (Math.abs(along.position - to) >= 1) along.scrollTo(to, 'instant');
    settle();
  };

  // With one slide per snap point, server HTML already rests here where the
  // browser honours `scroll-initial-target`, and this scroll is a no-op.
  // Where slides share snap points, slide `index` may rest at another snap
  // point, so the first paint may correct: server HTML cannot measure.
  // Shells need their own first pass, and their alignment copied from the
  // slides, before `restOn`'s own read of the snap points, which runs
  // before `settle`'s (ADR-0013): without it, the mid shells have no
  // `scroll-snap-align` yet, and there is nowhere to rest.
  layoutShells(viewport, axis());
  alignCopies(viewport);
  restOn(options.index);

  // A new layout that moves the snap points under the viewport keeps the
  // deck at its current index: a `dir` change (below), or loop's copies or
  // an effect's snap targets coming or going (`refresh`). Where the browser
  // puts the viewport then differs by browser, and a move in flight can stop
  // short in any of them. So a deck at rest goes back to its snap point, as
  // if it had mounted that way, before the browser renders the new layout,
  // and a moving deck rests on its move's target once the move ends
  // (`scrollEnded`). A deck a pointer holds goes back, or on to the
  // target, once it lets go (`letGo`). A scroll of the user's stands, a
  // touch pan or a mouse drag included: it settles at its own end, and so
  // does anyone else's, the page's own `scrollTo` or `scrollIntoView`
  // included. Only the engine's own jump off a copy (`jumping`), still
  // being reported by the browser, goes back to the current index once it
  // ends too, not wherever it leaves the viewport. Where the new layout has
  // fewer snap points, the deck rests on the last, and reports it. Returns
  // whether the deck has kept its place, or will once the pointer lets go
  // or the scroll ends, so nothing settles before then.
  const keepPlace = () => {
    if (drag === 'dragging') return false;
    if (move) {
      relaidOut = true;
      return false;
    }
    if (pressed.size > 0) {
      placeOwed = state.index;
      paint();
      // Where the browser puts the viewport may be a scroll with no end
      // event: it ends at quiet, unless the user scrolls (see `relaidAt`).
      refreshOwed = !userScroll;
      awaitQuiet();
      return true;
    }
    if (scrolling) {
      if (jumping) relaidOut = true;
      return false;
    }
    restOn(state.index);
    return true;
  };

  // Writing direction is read from the computed `direction` (ADR-0003), and
  // a live switch is followed when a `dir` attribute changes on the viewport
  // or an ancestor, as a locale switch makes; a change of `direction` in CSS
  // alone is not watched, nor, as `contains` stops at a shadow root, a
  // change on an ancestor outside the deck's shadow root. It lays a
  // horizontal deck out the other way. Chromium keeps a deck at rest on its
  // snap target; Firefox and WebKit put it back at its new start.
  const onDir = (records: MutationRecord[]) => {
    if (records.some(({ target }) => target.contains(viewport))) {
      followViewport(0);
      keepPlace();
    }
  };
  const dirs = new MutationObserver(onDir);
  dirs.observe(viewport.ownerDocument.documentElement, {
    attributeFilter: ['dir'],
    subtree: true
  });

  // `scrollsnapchange` reports a settled snap target where it exists, no
  // later than `scrollend`; `publish` drops whichever report comes second.
  viewport.addEventListener('scroll', onScroll, { passive: true });
  viewport.addEventListener('scrollsnapchange', onEnd);
  viewport.addEventListener('scrollend', onEnd);
  viewport.addEventListener('wheel', onWheel, { passive: true });
  viewport.addEventListener('keydown', onKeyDown);
  viewport.addEventListener('focusin', onFocusIn);
  // A resize can add or remove snap points without any scroll, and only
  // Chromium reports that through `scrollsnapchange`.
  const resizes = new ResizeObserver(refresh);
  resizes.observe(viewport);
  // A media query can change which slides snap, as when a breakpoint changes
  // the page size, without resizing the viewport at all.
  window.addEventListener('resize', refresh);

  // Mouse drag (ADR-0006). Touch, pen and trackpad scroll natively. While
  // the primary button drags, snapping is off and the pointer moves the
  // scroll position. On release the velocity is projected to a snap point,
  // the engine scrolls there with snapping still off, and snapping comes back
  // when that scroll ends. Restoring snapping at release instead lets the
  // browser re-snap before the next frame, ignoring a flick.
  const onPointerDown = (event: PointerEvent) => {
    // A mouse's other buttons open menus, which can swallow the pointerup.
    if (event.pointerType !== 'mouse' || event.button === 0) {
      if (event.isPrimary) {
        for (const [id, type] of pressed) {
          if (type === event.pointerType) pressed.delete(id);
        }
      }
      // A new pen down: any pen the browser panned has lifted.
      if (event.pointerType === 'pen' && penPan !== null) {
        clearTimeout(penPan);
        penPan = null;
      }
      pressed.set(event.pointerId, event.pointerType);
      if (event.pointerType === 'touch') holdTouch(event.target);
      // A touch or pen, before the browser pans. A mouse shifts only where
      // its drag starts: a click must leave a scroll in flight alone.
      if (event.pointerType !== 'mouse') shiftOffCopies();
    }
    if (
      !dragEnabled ||
      event.pointerType !== 'mouse' ||
      event.button !== 0 ||
      drag === 'dragging'
    ) {
      return;
    }
    pointer = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    dragAxis = axis();
    last = dragAxis.at(event);
    travel = 0;
    samples = [{ t: event.timeStamp, travel: 0 }];
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    // The button let go where the viewport did not hear it.
    if ((event.buttons & 1) === 0) {
      release(event);
      return;
    }
    if (drag !== 'dragging') {
      if (!dragEnabled) return;
      // Under the threshold a press is still a click.
      const moved = Math.hypot(event.clientX - startX, event.clientY - startY);
      if (moved < DRAG_THRESHOLD_PX) return;
      try {
        viewport.setPointerCapture(pointer);
      } catch {
        // A busy main thread can deliver this move after the pointer
        // itself is gone, and the capture throws (#140). Tried before
        // anything else changes, so a throw here leaves the drag never
        // started.
        return;
      }
      // The drag takes over any scroll in flight, its own release included:
      // where the deck goes now is decided when the pointer lets go.
      drag = 'dragging';
      takeOver();
      removeSnap();
      // Before the drag first moves the deck (see `shiftOffCopies`).
      shiftOffCopies();
      dragAt = dragAxis.position;
      follow = null;
    }
    // The deck follows the pointer: a pointer moving toward the deck's start
    // drags it forward.
    const at = dragAxis.at(event);
    const delta = last - at;
    last = at;
    dragAxis.position = dragPosition() + delta;
    dragAt = dragAxis.position;
    travel += delta;
    samples.push({ t: event.timeStamp, travel });
    if (samples.length > MAX_SAMPLES) samples.shift();
  };

  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerId === pointer) release(event);
  };

  // Lost mid-drag, the capture may never deliver the pointerup. After a
  // pointerup, which releases the capture, the pointer is already let go.
  const onLostCapture = (event: PointerEvent) => {
    if (event.pointerId === pointer && drag === 'dragging') release(event);
  };

  const release = (event: PointerEvent) => {
    pointer = -1;
    if (drag !== 'dragging') return;
    suppressClick();
    // With loop, the copies' snap points too, a set of slides either way.
    const geometry = snapPoints(viewport, dragAxis);
    const reach =
      geometry.length > 0 ? geometry.sets * geometry.points.length : 0;
    const points = Array.from(
      { length: geometry.points.length + 2 * reach },
      (_, i) => positionOf(geometry, i - reach)
    );
    const position = dragPosition();
    follow = null;
    const velocity = releaseVelocity(samples, event.timeStamp);
    let next = nearest(points, position + velocity * MOMENTUM_MS);
    // A flick always moves at least one snap point the way it was thrown.
    if (
      Math.abs(velocity) > FLICK_PX_PER_MS &&
      (points[next] - position) * velocity <= 0
    ) {
      const ahead =
        velocity > 0
          ? points.findIndex((point) => point > position)
          : points.filter((point) => point < position).length - 1;
      if (ahead !== -1) next = ahead;
    }
    drag = 'releasing';
    if (deferred) scrollTo(deferred.index, deferred.across);
    else scrollTo(next - reach, true);
    deferred = null;
    // Already resting there, or nowhere to go: no scroll will end.
    if (!move) scrollEnded();
  };

  // A drag ends in a click on whatever the pointer pressed, such as a link
  // in a slide: swallow that one click.
  const suppressClick = () => {
    const swallow = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    viewport.addEventListener('click', swallow, { capture: true, once: true });
    // The click, if any, comes in the same task as the release.
    setTimeout(() => viewport.removeEventListener('click', swallow, true));
  };

  // A pressed link or image would start the browser's own drag and drop.
  const onDragStart = (event: Event) => {
    if (pointer !== -1) event.preventDefault();
  };

  viewport.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('pointermove', onPointerMove);
  viewport.addEventListener('pointerup', onPointerUp);
  viewport.addEventListener('pointercancel', onPointerCancel);
  for (const type of WINDOW_POINTER) {
    window.addEventListener(type, onWindowPointer, { capture: true });
  }
  window.addEventListener('blur', onBlur);
  window.addEventListener('touchend', onTouchEnd, { capture: true });
  window.addEventListener('touchcancel', onTouchEnd, { capture: true });
  viewport.addEventListener('lostpointercapture', onLostCapture);
  viewport.addEventListener('dragstart', onDragStart);

  let clickToFocus = false;
  // A bubbling listener: the click ending a drag is swallowed before it.
  // A pointer affordance: a keyboard click (detail 0) leaves the deck alone,
  // as focus moving into a slide already scrolls it into view.
  const onClick = (event: MouseEvent) => {
    if (!clickToFocus || state.slide === -1 || event.detail === 0) return;
    let slide = event.target instanceof Element ? event.target : null;
    while (slide && slide.parentElement !== viewport) {
      slide = slide.parentElement;
    }
    const along = axis();
    const { run, slides: own, first } = slidesOf(viewport);
    // A loop's copy is inert, so a click on it reaches the viewport itself:
    // the copy is the one under the pointer.
    let at = slide ? run.indexOf(slide) : -1;
    if (at === -1 && event.target === viewport) {
      const point = along.at(event);
      at = run.findIndex((box) => {
        const [start, end] = along.span(box.getBoundingClientRect());
        return start <= point && point < end;
      });
    }
    if (at === -1) return;
    // The snap point of the clicked slide's page. One slide to a page, that
    // is the slide's own. A copy's is a set of slides on from its slide's,
    // the way it is from the slides, so the deck moves to it across the seam.
    const index = wrap(at - first, own.length);
    const set = Math.floor((at - first) / own.length);
    const { points, slides } = snapPoints(viewport, along);
    const owner = pageOwner(viewport, along, slides, index);
    if (owner !== -1) scrollTo(slides[owner] + set * points.length, true);
  };
  viewport.addEventListener('click', onClick);

  // From the snap point a scroll in flight is heading to, if any. With loop,
  // a step from the last snap point goes on across the seam to the first.
  // At rest, from the snap point the viewport is at, a copy's included, so
  // a step from a copy the deck could not jump off still goes the way it is
  // pressed.
  const step = (delta: number) => {
    if (move) {
      // Since a new layout, the target counts the old snap points: go on
      // from the slides' snap point it stands for.
      scrollTo(
        (relaidOut ? wrap(move.target, state.count) : move.target) + delta,
        true
      );
      return;
    }
    const along = axis();
    const geometry = snapPoints(viewport, along);
    const count = geometry.points.length;
    if (geometry.length === 0 || count === 0) {
      scrollTo(state.index + delta, true);
      return;
    }
    let here = 0;
    const distance = (i: number) =>
      Math.abs(positionOf(geometry, i) - along.position);
    for (let i = -geometry.sets * count; i < (geometry.sets + 1) * count; i++) {
      if (distance(i) < distance(here)) here = i;
    }
    scrollTo(here + delta, true);
  };

  return {
    scrollTo(index, way = 'direct') {
      const along = axis();
      const geometry = snapPoints(viewport, along);
      const count = geometry.points.length;
      if (way === 'direct' || geometry.length === 0) {
        scrollTo(index);
        return;
      }
      if (!Number.isFinite(index) || count === 0) return;
      // The slide's snap point or either copy of it, whichever is nearest.
      const same = [-1, 0, 1].map((set) => clamp(index, count) + set * count);
      const distance = (i: number) =>
        Math.abs(positionOf(geometry, i) - along.position);
      scrollTo(
        same.reduce((a, b) => (distance(b) < distance(a) ? b : a)),
        true
      );
    },
    next: () => step(1),
    prev: () => step(-1),
    // A target on the copies is the slides' snap point it copies.
    target: () => (move ? wrap(move.target, state.count) : null),
    refresh,
    setDrag(enabled) {
      dragEnabled = enabled;
    },
    setClickToFocus(enabled) {
      clickToFocus = enabled;
    },
    setOrientation(orientation) {
      vertical = orientation === 'vertical';
      refresh();
    },
    destroy() {
      stopQuiet();
      if (penPan !== null) clearTimeout(penPan);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(focusFrame);
      const atDestroy = slidesOf(viewport);
      for (const slide of atDestroy.run) {
        slide.removeAttribute(IN_VIEW);
        if (slide instanceof HTMLElement) slide.style.removeProperty(PROGRESS);
      }
      // Shells mode writes `scroll-snap-align` onto the real slides, which
      // are never in `run` there (ADR-0013): removed here too.
      if (atDestroy.sets === 2) {
        for (const slide of atDestroy.slides) {
          if (slide instanceof HTMLElement) {
            slide.style.removeProperty('scroll-snap-align');
            slide.style.removeProperty('translate');
          }
        }
      }
      resizes.disconnect();
      dirs.disconnect();
      window.removeEventListener('resize', refresh);
      viewport.removeEventListener('scroll', onScroll);
      viewport.removeEventListener('scrollsnapchange', onEnd);
      viewport.removeEventListener('scrollend', onEnd);
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('keydown', onKeyDown);
      viewport.removeEventListener('focusin', onFocusIn);
      viewport.removeEventListener('pointerdown', onPointerDown);
      viewport.removeEventListener('pointermove', onPointerMove);
      viewport.removeEventListener('pointerup', onPointerUp);
      viewport.removeEventListener('pointercancel', onPointerCancel);
      for (const type of WINDOW_POINTER) {
        window.removeEventListener(type, onWindowPointer, { capture: true });
      }
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('touchend', onTouchEnd, { capture: true });
      window.removeEventListener('touchcancel', onTouchEnd, { capture: true });
      unholdTouch();
      viewport.removeEventListener('lostpointercapture', onLostCapture);
      viewport.removeEventListener('dragstart', onDragStart);
      viewport.removeEventListener('click', onClick);
      restoreSnap();
    }
  };
}

const SCROLL_END_DEBOUNCE_MS = 100;
/** How long a drag follows the viewport after the user's wheel or key
 * mid-drag: as long as the browser's smooth scroll for it can run. */
const USER_SCROLL_MS = 500;
/** Safari's `Touch`, which says whether a stylus made it. */
type StylusTouch = Touch & { touchType?: 'direct' | 'stylus' };
/** A pen the browser panned lets go this long after the pan began, if its
 * lift has not been heard by then. */
const PEN_LIFT_MS = 1000;
/** Keys a focused scroller scrolls by. */
const SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' '
]);

const PROGRESS = '--deck-slide-progress';
/** Marks a viewport child as a snap target rather than a slide. */
export const SNAP_TARGET = 'data-carouseldeck-snap-target';
/** Marks a viewport child as a loop's copy of a slide rather than a slide:
 * `before` the slides, or `after` them. */
export const COPY = 'data-carouseldeck-copy';
/** Marks a viewport child as a shell (ADR-0013): an empty, inert,
 * `aria-hidden` stand-in for a slide, out of flow, carrying its snap point
 * and its `scroll-snap-align`. The value is which set it is in, from -2 to
 * 2, 0 being the real slides' own set. */
export const SHELL = 'data-carouseldeck-shell';
/** Marks a viewport child as one of shells' two in-flow spacers, `before`
 * the real slides or `after` them (ADR-0013): each two sets long, so the
 * shells either side have room to sit, out of flow, over the scroll range
 * a five-set copies layout would have. */
export const SPACER = 'data-carouseldeck-spacer';
const IN_VIEW = 'data-in-view';
/** How much of a slide the scrollport must show for it to be in view. */
const IN_VIEW_MIN_PX = 1;

/** How far a mouse moves with its button down before a press is a drag. */
const DRAG_THRESHOLD_PX = 5;
/** Below this release speed, a drag places the deck rather than flicks it. */
const FLICK_PX_PER_MS = 0.4;
/** How far a flick carries: this long at its release speed. */
const MOMENTUM_MS = 220;
/** How many of the drag's latest moves it keeps to measure release speed. */
const MAX_SAMPLES = 8;
/** A pointer held still this long before letting go releases at rest. */
const STILL_MS = 60;
/** Release speed is measured over the drag's moves this long before its
 * last one. */
const VELOCITY_WINDOW_MS = 80;

/** Scroll pixels per ms over the drag's last moments; 0 if the pointer held
 * still before letting go. */
function releaseVelocity(
  samples: { t: number; travel: number }[],
  now: number
): number {
  const last = samples[samples.length - 1];
  if (now - last.t > STILL_MS) return 0;
  const first =
    samples.find((s) => last.t - s.t <= VELOCITY_WINDOW_MS) ?? samples[0];
  const dt = last.t - first.t;
  return dt > 0 ? (last.travel - first.travel) / dt : 0;
}

const clamp = (index: number, count: number) =>
  Math.min(Math.max(index, 0), count - 1);

/** `index` wrapped onto 0 up to `count`, as a loop's copies are onto the
 * slides. */
const wrap = (index: number, count: number) =>
  ((index % count) + count) % count;

/** Where snap point `index` rests. With loop, an index up to a set of slides
 * past either end is on the copies there: -1 is the last slide's copy before
 * the slides. */
function positionOf({ points, length }: Geometry, index: number): number {
  const set = Math.floor(index / points.length);
  return points[index - set * points.length] + set * length;
}

/** Whether a looping deck can rest at snap point `index`: a slide's, or a
 * copy's up to a set past either end that the scroll range reaches. */
function reachable(geometry: Geometry, axis: Axis, index: number): boolean {
  const count = geometry.points.length;
  const { sets } = geometry;
  if (index < -sets * count || index > (sets + 1) * count - 1) return false;
  const position = positionOf(geometry, index);
  return position >= -1 && position <= axis.max() + 1;
}

/** The snap point nearest `position`; with loop, once a position on the
 * copies is wrapped onto the slides. */
function indexAt({ points, length }: Geometry, position: number): number {
  if (length === 0) return nearest(points, position);
  const start = points[0];
  const wrapped = start + wrap(position - start, length);
  // Just short of a set past the first point is the first point again.
  return nearest([...points, start + length], wrapped) % points.length;
}

function nearest(points: number[], position: number): number {
  let best = 0;
  points.forEach((point, i) => {
    if (Math.abs(point - position) < Math.abs(points[best] - position)) {
      best = i;
    }
  });
  return best;
}

/**
 * The viewport's slides; the run of slides along the axis, which with loop is
 * the copies before the slides (children marked `data-carouseldeck-copy=before`),
 * the slides and the copies after them, and without is the slides; and the
 * box each of the run is measured by: its own, or where the viewport holds
 * snap targets (children marked `data-carouseldeck-snap-target`), the target in
 * the same place among them. Snap targets and copies are not slides. An effect
 * that stacks the slides in one place, where none of them could mark a snap
 * point, lays out one per slide, and per copy, along the axis instead.
 * `first` is where slide 0 is in the run.
 */
function slidesOf(viewport: HTMLElement): {
  slides: Element[];
  run: Element[];
  boxes: Element[];
  first: number;
  /** With loop, how many sets of copies, or of shells, sit before the
   * slides (and after them); 0 without. Shells always give 2. */
  sets: number;
} {
  const slides: Element[] = [];
  const before: Element[] = [];
  const after: Element[] = [];
  const targets: Element[] = [];
  const shellSets = new Map<number, Element[]>();
  for (const child of viewport.children) {
    if (child.hasAttribute(SPACER)) continue;
    if (child.hasAttribute(SHELL)) {
      const set = Number(child.getAttribute(SHELL));
      const shells = shellSets.get(set);
      if (shells) shells.push(child);
      else shellSets.set(set, [child]);
      continue;
    }
    if (child.hasAttribute(SNAP_TARGET)) targets.push(child);
    else if (!child.hasAttribute(COPY)) slides.push(child);
    else (child.getAttribute(COPY) === 'before' ? before : after).push(child);
  }
  // Shells carry their own snap points (ADR-0013): the run is the shells,
  // in set order, and the slides are never in it. `first` is where the
  // slides' own set of shells starts, two sets in.
  if (shellSets.size > 0) {
    const run = [-2, -1, 0, 1, 2].flatMap((set) => shellSets.get(set) ?? []);
    return { slides, run, boxes: run, first: 2 * slides.length, sets: 2 };
  }
  const run = [...before, ...slides, ...after];
  const boxes =
    targets.length === 0 ? run : run.map((slide, i) => targets[i] ?? slide);
  return {
    slides,
    run,
    boxes,
    first: before.length,
    sets: slides.length > 0 ? before.length / slides.length : 0
  };
}

/**
 * Whether the viewport holds loop's copies, and whether it holds snap
 * targets: when either comes or goes, as when `loop` or an effect changes,
 * the snap points move under the viewport (ADR-0007, ADR-0009). So does a
 * slide added to or removed from a looping deck, as its copy before the
 * slides moves every slide by one (#146): the copies before the slides are
 * counted. Slides added to a deck that does not loop, or snap targets added
 * to those already there, leave it as it is.
 */
const shapeOf = (viewport: HTMLElement) =>
  [
    ...[COPY, SNAP_TARGET, SHELL].map(
      (marker) => viewport.querySelector(`:scope > [${marker}]`) !== null
    ),
    slidesOf(viewport).first
  ].join();

/**
 * Gives each loop copy, or shell, its slide's snap alignment, inline: CSS
 * that picks the slides that snap by their place among the viewport's
 * children, as `:nth-child()` does for pages, would pick other copies or
 * shells. With shells, the real slides carry `scroll-snap-align: none`
 * unconditionally instead (ADR-0013): their shells carry the snap points,
 * so their own inline override is cleared first, to read the consumer's
 * computed value beneath it, then put back in the same task; their
 * `scroll-margin` is copied onto the shells too, since shells have none of
 * their own. Written only where it differs, so a settle lays out once.
 */
function alignCopies(viewport: HTMLElement) {
  const { slides, run, first, sets } = slidesOf(viewport);
  const shells = sets === 2;
  if (first === 0 && !shells) return;
  const own = slides.filter(
    (slide): slide is HTMLElement => slide instanceof HTMLElement
  );
  if (shells) for (const slide of own) slide.style.scrollSnapAlign = '';
  // The whole value, both axes, not the axis's: a copy or shell must snap
  // as its slide does on either axis, so it is copied as it is, not read.
  const aligns = slides.map((slide) => getComputedStyle(slide).scrollSnapAlign);
  const margins = shells
    ? slides.map((slide) => getComputedStyle(slide).scrollMargin)
    : [];
  if (shells) {
    for (const slide of own) {
      if (slide.style.scrollSnapAlign !== 'none') {
        slide.style.scrollSnapAlign = 'none';
      }
    }
  }
  run.forEach((copy, i) => {
    if (!shells && i >= first && i < first + slides.length) return;
    const index = wrap(i - first, slides.length);
    const align = aligns[index];
    if (copy instanceof HTMLElement && copy.style.scrollSnapAlign !== align) {
      copy.style.scrollSnapAlign = align;
    }
    if (shells && copy instanceof HTMLElement) {
      const margin = margins[index];
      if (copy.style.scrollMargin !== margin) copy.style.scrollMargin = margin;
    }
  });
}

/**
 * Shells mode only (ADR-0013): measures the real slides' home positions —
 * where each sits now, in content coordinates, independent of any
 * `translate` already on it — and the run's length `L`, from a slide to
 * its own shell a set over (decision 2: the distance from the first
 * slide's start to the last slide's end, plus its trailing margin, the
 * viewport's gap and the first slide's own leading margin). The spacers
 * each take `2L` less one gap, so the scroll range matches a five-set
 * copies layout; shell `(k, i)` sits at slide `i`'s home plus `k·L`, sized
 * to match it, placed with logical insets so RTL needs no special case.
 * Written only where a value differs, so a settle lays out once. A no-op
 * outside shells mode.
 */
function layoutShells(viewport: HTMLElement, along: Axis) {
  const { slides, run, sets } = slidesOf(viewport);
  const n = slides.length;
  if (sets !== 2 || n === 0) return;
  const write = (
    el: Element,
    prop: 'insetInlineStart' | 'insetBlockStart' | 'width' | 'height' | 'flex',
    value: string
  ) => {
    if (el instanceof HTMLElement && el.style[prop] !== value) {
      el.style[prop] = value;
    }
  };

  // `length` (L) comes from the slides' own geometry alone, never from
  // where the spacers put them: computed first, so the spacers can be
  // sized from it before anything reads a slide's position.
  const gap = along.gap(getComputedStyle(viewport));
  const first = slides[0];
  const last = slides[n - 1];
  const [start0] = along.span(first.getBoundingClientRect());
  const [, endN] = along.span(last.getBoundingClientRect());
  const [marginStart0] = along.insets(getComputedStyle(first), 'margin', 0);
  const [, marginEndN] = along.insets(getComputedStyle(last), 'margin', 0);
  const length = endN + marginEndN + gap + marginStart0 - start0;

  // The spacers, before the real slides' positions are read: on a layout
  // that moves them, as the first settle's does, the slides' own position
  // already reflects it once this write lands.
  const spacerSize = `0 0 ${Math.max(0, 2 * length - gap)}px`;
  for (const side of ['before', 'after'] as const) {
    const spacer = viewport.querySelector(`:scope > [${SPACER}="${side}"]`);
    if (spacer) write(spacer, 'flex', spacerSize);
  }

  const view = along.view();
  const position = along.position;
  const home = (slide: Element) => {
    const [start] = along.span(slide.getBoundingClientRect());
    const translate =
      slide instanceof HTMLElement
        ? parseFloat(getComputedStyle(slide).translate) || 0
        : 0;
    return start - translate - view[0] + position;
  };
  const homes = slides.map(home);

  const insetProp = along.vertical ? 'insetBlockStart' : 'insetInlineStart';
  const sizeProp = along.vertical ? 'height' : 'width';
  const crossProp = along.vertical ? 'width' : 'height';
  run.forEach((shell, idx) => {
    const i = idx % n;
    const set = Math.floor(idx / n) - 2;
    const box = slides[i].getBoundingClientRect();
    const [slideStart, slideEnd] = along.span(box);
    write(shell, insetProp, `${homes[i] + set * length}px`);
    write(shell, sizeProp, `${slideEnd - slideStart}px`);
    write(shell, crossProp, `${along.vertical ? box.width : box.height}px`);
  });
}

/** The slides' snap points; see `snapPoints`. */
interface Geometry {
  /** The slides' snap points, ascending; never the copies'. */
  points: number[];
  /** For each slide, the index of the point it rests at, or -1. */
  slides: number[];
  /** With loop, how far one set of slides runs along the axis, from a slide
   * to its copy after the slides; 0 without. */
  length: number;
  /** With loop, how many sets of copies the viewport holds before the
   * slides (and after them); 0 without. */
  sets: number;
}

/**
 * Where the browser rests the viewport to snap `box`, or null if it does not
 * snap: its snap area, the box plus its scroll margin, aligned in the
 * snapport, the scrollport less its scroll padding, and clamped to the
 * scroll range unless `clamped` is false.
 */
function snapRest(viewport: HTMLElement, axis: Axis, clamped = true) {
  const max = axis.max();
  const position = axis.position;
  const view = axis.view();
  const [padStart, padEnd] = axis.insets(
    getComputedStyle(viewport),
    'scrollPadding',
    view[1] - view[0]
  );
  const snapport: Span = [view[0] + padStart, view[1] - padEnd];
  return (box: Element): number | null => {
    const align = axis.snapAlign(box);
    if (align === 'none') return null;
    const [start, end] = axis.span(box.getBoundingClientRect());
    const [marginStart, marginEnd] = axis.insets(
      getComputedStyle(box),
      'scrollMargin',
      0
    );
    const offset = spanOffset(
      [start - marginStart, end + marginEnd],
      snapport,
      align
    );
    const rest = Math.round(position + offset);
    return clamped ? Math.min(Math.max(rest, 0), max) : rest;
  };
}

/**
 * The scroll positions the viewport can rest at, ascending, as the browser
 * derives them from each slide's `scroll-snap-align`, and for each slide the
 * index of the point it rests at (-1 if it does not snap). A slide's snap
 * alignment and position are its measured box's (see `slidesOf`).
 * Slides that clamp to the same scroll position share one snap point. With
 * loop, only the slides' points, not the copies' (see `Geometry`).
 */
function snapPoints(viewport: HTMLElement, axis: Axis): Geometry {
  const view = axis.view();
  const restOf = snapRest(viewport, axis);
  const { slides, boxes, first, sets } = slidesOf(viewport);
  const own = boxes.slice(first, first + slides.length);
  const positions = own.map(restOf);
  const points = [
    ...new Set(positions.filter((p): p is number => p !== null))
  ].sort((a, b) => a - b);
  // From slide 0 to its copy after the slides.
  const length =
    first > 0 && boxes.length > first + slides.length
      ? axis.span(boxes[first + slides.length].getBoundingClientRect())[0] -
        axis.span(boxes[first].getBoundingClientRect())[0]
      : 0;
  // A set no longer than the viewport would bring a copy into view beside
  // its own slide: nothing to loop, as with any deck whose slides all fit.
  if (length > 0 && length - (view[1] - view[0]) < 1) {
    return {
      points: points.slice(0, 1),
      slides: positions.map((p) => (p === null ? -1 : 0)),
      length: 0,
      sets: 0
    };
  }
  return {
    points,
    slides: positions.map((p) => (p === null ? -1 : points.indexOf(p))),
    length,
    sets
  };
}

/**
 * The snapping slide whose page holds slide `index`, as its alignment reaches:
 * of the snapping slides `start`-aligned at or before it, `end`-aligned at or
 * after it, or `center`-aligned either side, the nearest; -1 if none.
 * `slides` is from `snapPoints`.
 */
function pageOwner(
  viewport: HTMLElement,
  axis: Axis,
  slides: number[],
  index: number
): number {
  let owner = -1;
  const { boxes, first } = slidesOf(viewport);
  slides.forEach((point, i) => {
    if (point === -1) return;
    const align = axis.snapAlign(boxes[first + i]);
    if ((align === 'start' && i > index) || (align === 'end' && i < index)) {
      return;
    }
    if (owner === -1 || Math.abs(i - index) < Math.abs(owner - index)) {
      owner = i;
    }
  });
  return owner;
}

/** A span along the deck's axis: where something starts and ends, measured
 * the way the deck runs. */
type Span = [start: number, end: number];

/**
 * The deck's axis, as the viewport lays it out now. Every scroll position and
 * measurement the engine uses runs along it from the deck's start, so the
 * rest of the engine never asks which way the deck runs. Horizontal follows
 * the viewport's writing direction: in right-to-left the start is the right
 * edge, and browsers report `scrollLeft` as 0 there and negative past it.
 */
interface Axis {
  /** How far the viewport has scrolled from the deck's start. */
  position: number;
  /** The furthest the viewport can scroll from the start. */
  max(): number;
  scrollTo(position: number, behavior: ScrollBehavior): void;
  /** Where a point on screen falls along the axis. */
  at(point: { clientX: number; clientY: number }): number;
  /** Where a box on screen spans along the axis. */
  span(box: { left: number; right: number; top: number; bottom: number }): Span;
  /** Where the viewport's scrollport spans along the axis. */
  view(): Span;
  /** A slide's `scroll-snap-align` along the axis: of its block and inline
   * values, the block for a vertical deck, the inline for a horizontal one. */
  snapAlign(slide: Element): string;
  /** A box's `scrollPadding`, `scrollMargin` or plain `margin` at the
   * axis's start and end, in pixels; a percentage is of `size`, and `auto`
   * is none. */
  insets(
    style: CSSStyleDeclaration,
    property: 'scrollPadding' | 'scrollMargin' | 'margin',
    size: number
  ): Span;
  /** Whether the axis is the block axis (a vertical deck). Shells
   * (ADR-0013) use it to place themselves with logical insets. */
  vertical: boolean;
  /** The viewport's `columnGap` (horizontal) or `rowGap` (vertical), in
   * pixels; `normal` is 0. */
  gap(style: CSSStyleDeclaration): number;
}

function axisOf(viewport: HTMLElement, vertical: boolean): Axis {
  const sign =
    !vertical && getComputedStyle(viewport).direction === 'rtl' ? -1 : 1;
  const span: Axis['span'] = (box) =>
    vertical
      ? [box.top, box.bottom]
      : sign === 1
        ? [box.left, box.right]
        : [-box.right, -box.left];
  return {
    get position() {
      return vertical ? viewport.scrollTop : sign * viewport.scrollLeft;
    },
    set position(position) {
      if (vertical) viewport.scrollTop = position;
      else viewport.scrollLeft = sign * position;
    },
    max: () =>
      vertical
        ? viewport.scrollHeight - viewport.clientHeight
        : viewport.scrollWidth - viewport.clientWidth,
    scrollTo: (position, behavior) =>
      viewport.scrollTo(
        vertical
          ? { top: position, behavior }
          : { left: sign * position, behavior }
      ),
    at: (point) => (vertical ? point.clientY : sign * point.clientX),
    span,
    view() {
      const box = viewport.getBoundingClientRect();
      const left = box.left + viewport.clientLeft;
      const top = box.top + viewport.clientTop;
      return span({
        left,
        right: left + viewport.clientWidth,
        top,
        bottom: top + viewport.clientHeight
      });
    },
    snapAlign(slide) {
      const values = getComputedStyle(slide).scrollSnapAlign.split(' ');
      return (vertical ? values[0] : values.pop()) ?? 'none';
    },
    insets(style, property, size) {
      const sides = vertical
        ? (['Top', 'Bottom'] as const)
        : sign === 1
          ? (['Left', 'Right'] as const)
          : (['Right', 'Left'] as const);
      return sides.map((side) => {
        const value = style[`${property}${side}`];
        const amount = parseFloat(value) || 0;
        return value.endsWith('%') ? (amount / 100) * size : amount;
      }) as Span;
    },
    vertical,
    gap(style) {
      const value = style[vertical ? 'rowGap' : 'columnGap'];
      return value === 'normal' ? 0 : parseFloat(value) || 0;
    }
  };
}

/** How far the viewport would scroll to put `slide` at the alignment point
 * for `align`, unclamped: 0 when it is there now. `view` is the axis's. */
function alignOffset(
  axis: Axis,
  view: Span,
  slide: Element,
  align: string
): number {
  return spanOffset(axis.span(slide.getBoundingClientRect()), view, align);
}

/** `alignOffset` for a slide spanning `[start, end]` along the axis. */
function spanOffset([start, end]: Span, view: Span, align: string): number {
  return align === 'center'
    ? (start + end) / 2 - (view[0] + view[1]) / 2
    : align === 'end'
      ? end - view[1]
      : start - view[0];
}

/** The slide nearest the alignment point for `align`, by its measured box;
 * with loop, the slide a copy there copies. */
function focalSlide(viewport: HTMLElement, axis: Axis, align: string): number {
  const view = axis.view();
  const { slides, boxes, first } = slidesOf(viewport);
  let best = -1;
  let distance = Infinity;
  boxes.forEach((slide, i) => {
    const d = Math.abs(alignOffset(axis, view, slide, align));
    if (d < distance) {
      best = i;
      distance = d;
    }
  });
  return best === -1 ? -1 : wrap(best - first, slides.length);
}

/**
 * Writes each slide's progress and in-view state (see `createDeck`). Measures
 * every slide before writing to any, and writes only what changed, so a frame
 * lays out once.
 */
function writeProgress(viewport: HTMLElement, axis: Axis, align: string) {
  const view = axis.view();
  // With loop, the copies too, each by its own place in the run: a copy in
  // view moves on as the slides do, and lands where its slide is after a
  // jump.
  const { run: slides, boxes } = slidesOf(viewport);
  const spans = boxes.map((box) => axis.span(box.getBoundingClientRect()));
  const focal = focalPosition(
    spans.map((span) => spanOffset(span, view, align)),
    spans
  );
  slides.forEach((slide, i) => {
    const [start, end] = spans[i];
    const inView =
      Math.min(end, view[1]) - Math.max(start, view[0]) >= IN_VIEW_MIN_PX;
    if (slide.hasAttribute(IN_VIEW) !== inView) {
      slide.toggleAttribute(IN_VIEW, inView);
    }
    if (!(slide instanceof HTMLElement)) return;
    const progress = String(Math.round((i - focal) * 1000) / 1000);
    if (slide.style.getPropertyValue(PROGRESS) !== progress) {
      slide.style.setProperty(PROGRESS, progress);
    }
  });
}

/**
 * Where the alignment point falls among the slides, in slides: 2 at slide
 * 2's alignment point, 2.25 a quarter of the way on to slide 3's. Before the
 * first slide's or past the last's, it carries on at the spacing of the
 * nearest two. `offsets` are the slides' `spanOffset`s, ascending.
 */
function focalPosition(offsets: number[], spans: Span[]): number {
  if (offsets.length === 0) return 0;
  if (offsets.length === 1) {
    const extent = spans[0][1] - spans[0][0];
    return extent > 0 ? -offsets[0] / extent : 0;
  }
  const before = offsets.filter((offset) => offset <= 0).length - 1;
  const k = clamp(before, offsets.length - 1);
  const spacing = offsets[k + 1] - offsets[k];
  return spacing > 0 ? k - offsets[k] / spacing : k;
}
