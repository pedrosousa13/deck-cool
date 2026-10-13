import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  use,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type Ref,
  type RefObject
} from 'react';
import {
  COPY,
  createDeck,
  SHELL,
  SNAP_TARGET,
  SPACER,
  type DeckEngine,
  type Orientation
} from '@carouseldeck/core';
import { LoopShells } from './loop-shells.js';
import { ServerSlides } from './server-slides.js';
import { slidesIn } from './slides-in.js';

export type { Orientation };

// Left in the build for the consumer's bundler to replace, as React's own
// development checks are, so production bundles drop the warnings.
declare const process: { env: { NODE_ENV?: string } };

interface DeckContextValue {
  index: number;
  /** Snap point count; null until the viewport has been measured. */
  count: number | null;
  /** The current slide; null until the viewport has been measured. */
  slide: number | null;
  /** The focal slide; null until the viewport has been measured. */
  focal: number | null;
  /** The slides in Deck.Viewport, for the first render only, before any
   * measurement: Dots and Counter then count a page per slide. Null after, or
   * where Root cannot see Viewport's children. */
  slides: number | null;
  initialIndex: number;
  orientation: Orientation;
  /** Whether Root has `loop`. */
  loop: boolean;
  viewportRef: RefObject<HTMLDivElement | null>;
  engineRef: RefObject<DeckEngine | null>;
  /** Whether Root has `autoplay`. */
  hasAutoplay: boolean;
  /** Whether autoplay is on: the user has not stopped it. A pointer over the
   * deck or a hidden document pauses it without turning it off. */
  playing: boolean;
  /** Turns autoplay on or off, as the user does with the toggle. */
  togglePlaying(): void;
  /** The engine, for a move the user makes with a control: stops autoplay. */
  userMove(): DeckEngine | null;
}

const clampSlide = (index: number, count: number) =>
  Math.min(Math.max(index, 0), count - 1);

/** A stacked, looping slide's progress with shells (ADR-0013, Task 5; the
 * maintainer's ruling on the fork, 2026-10-13): wrapped into `(b, b + n]`,
 * `b = -0.9985` -- a slide thrown to within the engine's precision returns
 * at the back, rather than carrying on past -1 with nowhere shown, as
 * shells give it no copy of its own to land on (the card-stack recipe's
 * own two windows, kept unchanged, already meet exactly there). Mirrors
 * `@carouseldeck/core`'s own copy of the same formula, which gives the
 * engine's measured progress the same wrap once it mounts. */
const STACKED_WRAP = -0.9985;
function wrapStackedProgress(progress: number, count: number): number {
  let wrapped = progress;
  while (wrapped <= STACKED_WRAP) wrapped += count;
  while (wrapped > STACKED_WRAP + count) wrapped -= count;
  return wrapped;
}

const DeckContext = createContext<DeckContextValue | null>(null);

function useDeckContext(primitive: string): DeckContextValue {
  const deck = use(DeckContext);
  if (!deck) throw new Error(`Deck.${primitive} must be inside Deck.Root`);
  return deck;
}

/** What `Deck.Root`'s `handleRef` exposes: moves for event handlers that
 * should not round-trip through state. Each fires `onIndexChange` when the deck
 * settles on a new snap point. */
export interface RootHandle {
  /** Scrolls to a snap point, clamped to the snap points there are. */
  scrollTo(index: number): void;
  /** Scrolls one snap point on. */
  next(): void;
  /** Scrolls one snap point back. */
  prev(): void;
}

interface RootBaseProps extends ComponentProps<'div'> {
  /** The deck's moves; `ref` is the region element, as on every primitive. */
  handleRef?: Ref<RootHandle>;
  /** Whether a mouse can drag the deck, settling on a snap point when it lets
   * go. A drag never clicks what it started on. Touch, pen and trackpad
   * always scroll natively. Defaults to true. */
  drag?: boolean;
  /** Called once each time the focal slide changes, with its slide index,
   * or -1 when no slide snaps: when a scroll settles, never during one, and
   * not for where the deck starts. */
  onFocalChange?: (slide: number) => void;
  /** Whether clicking a slide brings it to the focal position, as near as
   * the scroll range allows; with pages, its page. A click that ends a mouse
   * drag does not, nor does a keyboard click (Enter or Space on a control),
   * nor a programmatic `element.click()` (detail 0): call `scrollTo` on the
   * handle instead. Defaults to false. */
  clickToFocus?: boolean;
  /** The axis the deck scrolls along. A vertical deck needs a height, set on
   * `Deck.Viewport` in CSS. Horizontal follows the writing direction: in a
   * right-to-left document the deck starts at the right and Next moves left.
   * Defaults to horizontal. */
  orientation?: Orientation;
  /** Whether scrolling past the last snap point arrives at the first, and
   * back, with no visible jump: Prev and Next are then never disabled.
   * `Deck.Viewport` renders a copy of every slide on each side of the
   * slides, inert and `aria-hidden`, and the deck jumps from a copy to its
   * slide once it rests (clone and jump, ADR-0006, as built in ADR-0009).
   * Indexes, Dots and Counter count the slides' snap points only, never the
   * copies'. A copy renders the slide's children again, so their state is
   * their own and an `id` in a slide repeats; `useSlide` tells them whether
   * they are in a copy. A deck whose slides all fit does not loop and renders
   * no copies. Defaults to false. */
  loop?: boolean;
  /** Moves the deck one snap point on every this many milliseconds, counted
   * from when it comes to rest, and stops at the last, unless the deck
   * loops, or where a step leaves the deck where it was, as when a
   * controlled parent refuses it. A pointer over the deck or a hidden
   * document pauses it; focus entering the deck, other than on
   * `Deck.AutoplayToggle`, or the user moving it stops it until the toggle
   * starts it again, and so does a preference for reduced motion, from the
   * start. Pair it with `Deck.AutoplayToggle` (WCAG 2.2.2). Off by default. */
  autoplay?: number;
}

/** Controlled like a React input's `value`: the deck scrolls to `index` when
 * it changes. A scroll that settles elsewhere calls `onIndexChange`, and the
 * deck returns to `index` unless the parent takes the new one. */
interface ControlledProps {
  /** The snap point to rest at. */
  index: number;
  defaultIndex?: never;
  /** Called once each time the viewport settles on a new snap point other
   * than `index`; never for a move to `index`. Without it, every scroll returns
   * to `index`, and development warns. */
  onIndexChange?: (index: number) => void;
}

interface UncontrolledProps {
  index?: never;
  /** The snap point to start at, clamped to the snap points there are.
   * Read once, on mount. */
  defaultIndex?: number;
  /** Called once each time the viewport settles on a new snap point. */
  onIndexChange?: (index: number) => void;
}

export type RootProps = RootBaseProps & (ControlledProps | UncontrolledProps);

/** One deck: a labelled carousel region holding a viewport, its controls and
 * a live region announcing the slide the user moves it to. */
export function Root({
  index,
  defaultIndex,
  onIndexChange,
  handleRef,
  drag = true,
  onFocalChange,
  clickToFocus = false,
  orientation = 'horizontal',
  loop = false,
  autoplay,
  children,
  onFocus,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  onKeyDown,
  onWheel,
  ...props
}: RootProps) {
  // Core starts a non-finite index at 0; so must the first render.
  const [initialIndex] = useState(() => {
    const start = index ?? defaultIndex ?? 0;
    return Number.isFinite(start) ? start : 0;
  });
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- the condition is constant for a build
    useDevWarnings(index, defaultIndex, onIndexChange);
  }
  const [state, setState] = useState<{
    index: number;
    count: number | null;
    slide: number | null;
    focal: number | null;
  }>({ index: initialIndex, count: null, slide: null, focal: null });
  const viewportRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<DeckEngine>(null);
  const onIndexChangeRef = useRef(onIndexChange);
  const onFocalChangeRef = useRef(onFocalChange);
  const indexRef = useRef(index);
  // The index the deck last reported through `onIndexChange`, until the
  // render after it.
  const reportedRef = useRef<number | null>(null);
  const orientationRef = useRef(orientation);
  // What the live region says: the current slide, after the deck moves.
  const [announcement, setAnnouncement] = useState('');
  // Autoplay is on until the user, focus or reduced motion stops it; a
  // pointer over the deck or a hidden document only pauses it.
  const [playing, setPlaying] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(false);
  // Whether a pointer is over the deck, as soon as it enters or leaves: the
  // render that pauses autoplay comes later.
  const hoveredRef = useRef(false);
  // Autoplay stopped because the deck could not move on: Start rewinds.
  const endedRef = useRef(false);
  // Autoplay started the deck's latest move: its settles are not announced.
  // The user's input, or an API call, takes the move over.
  const autoplayMovedRef = useRef(false);
  // Where autoplay last stepped from: resting there again, the step did not
  // move the deck. Any move autoplay did not start clears it.
  const stepFromRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    onIndexChangeRef.current = onIndexChange;
    onFocalChangeRef.current = onFocalChange;
    indexRef.current = index;
  });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) throw new Error('Deck.Root must contain a Deck.Viewport');
    // The first report is where the deck starts, not a change.
    let settled: number | undefined;
    let focal: number | undefined;
    const engine = createDeck(viewport, {
      index: initialIndex,
      orientation: orientationRef.current,
      onChange(next) {
        setState(next);
        // A change is a settle on a new snap point; a report of a new count
        // alone is not. Controlled, it must also be anywhere but `index`, so
        // a move to `index` never calls back.
        const controlled = indexRef.current;
        if (
          settled !== undefined &&
          next.index !== settled &&
          (controlled === undefined ||
            next.index !== clampSlide(controlled, next.count))
        ) {
          reportedRef.current = next.index;
          onIndexChangeRef.current?.(next.index);
        }
        if (settled !== undefined && next.index !== settled) {
          endedRef.current = false;
          // Cleared rather than kept after an autoplay move, so the user's
          // next move is announced even to the slide last announced.
          setAnnouncement(
            next.slide === -1 || autoplayMovedRef.current
              ? ''
              : `Slide ${next.slide + 1} of ${slideCount(viewport)}`
          );
        }
        settled = next.index;
        if (focal !== undefined && next.focal !== focal) {
          onFocalChangeRef.current?.(next.focal);
        }
        focal = next.focal;
      }
    });
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [initialIndex]);

  useLayoutEffect(() => {
    engineRef.current?.setDrag(drag);
  }, [drag]);

  useLayoutEffect(() => {
    engineRef.current?.setClickToFocus(clickToFocus);
  }, [clickToFocus]);

  useLayoutEffect(() => {
    orientationRef.current = orientation;
    engineRef.current?.setOrientation(orientation);
  }, [orientation]);

  // Controlled, the deck rests at `index`: it follows a new one, and returns
  // to it after a scroll the parent did not take, as a controlled input
  // reverts an edit its parent ignores. Compared with where a scroll in
  // flight is heading, if any, so an `index` changed back mid-flight wins.
  // A new `index` is the parent's move, so it is announced; a return to
  // it belongs to the move it undoes. A looping deck follows a new `index`
  // the direct way, as `scrollTo` goes, and returns to an `index` the parent
  // kept whichever way is shorter, across the seam when that is shorter,
  // whether or not the move it undoes crossed it. An `index` the parent
  // took from `onIndexChange` never undoes a move started since, as a press
  // before this render: that move goes on. A deck at rest off it goes to it.
  const previousIndexRef = useRef(index);
  useLayoutEffect(() => {
    const engine = engineRef.current;
    const moved = index !== previousIndexRef.current;
    if (moved) {
      autoplayMovedRef.current = false;
      stepFromRef.current = null;
    }
    previousIndexRef.current = index;
    const reported = reportedRef.current;
    reportedRef.current = null;
    if (index !== undefined && state.count !== null && engine) {
      const to = clampSlide(index, state.count);
      const target = engine.target();
      const heading = target ?? state.index;
      if (to !== heading && (to !== reported || target === null)) {
        engine.scrollTo(index, moved ? 'direct' : 'short');
      }
    }
  }, [index, state.index, state.count]);

  // Autoplay's user-driven state (playing, hover, a hidden document)
  // re-renders an autoplay deck, an accepted exception in ADR-0003; scroll
  // never does. Without autoplay none of it is tracked, so nothing changes.
  const autoplaying = autoplay !== undefined;

  useLayoutEffect(() => {
    if (!autoplaying) return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const stopIfReduced = () => {
      if (query.matches) setPlaying(false);
    };
    stopIfReduced();
    query.addEventListener('change', stopIfReduced);
    return () => query.removeEventListener('change', stopIfReduced);
  }, [autoplaying]);

  useEffect(() => {
    if (!autoplaying) return;
    const update = () => setHidden(document.visibilityState === 'hidden');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [autoplaying]);

  const rotating =
    autoplaying &&
    playing &&
    !hovered &&
    !hidden &&
    state.count !== null &&
    !everySlideFits(state.count);

  // One step per interval, counted afresh each time the deck comes to rest
  // on a new snap point. A step that does not bring the deck to rest on a
  // new snap point ends autoplay: at the last one, or where a controlled
  // parent refuses it. Where next() goes on from the last snap point to the
  // first, as it does with loop, it never ends.
  useEffect(() => {
    if (!rotating) return;
    let timer: ReturnType<typeof setTimeout>;
    const end = () => {
      endedRef.current = true;
      stepFromRef.current = null;
      setPlaying(false);
    };
    const tick = () => {
      const engine = engineRef.current;
      if (!engine) return;
      // A scroll the engine started is still in flight: let it rest first.
      // Paused since the last render, as a step can fall due after the
      // pointer enters or the document hides but before that render: wait.
      if (
        engine.target() !== null ||
        hoveredRef.current ||
        document.visibilityState === 'hidden'
      ) {
        timer = setTimeout(tick, autoplay);
        return;
      }
      if (stepFromRef.current === state.index) {
        end();
        return;
      }
      stepFromRef.current = state.index;
      autoplayMovedRef.current = true;
      engine.next();
      if (engine.target() === null) end();
    };
    timer = setTimeout(tick, autoplay);
    return () => clearTimeout(timer);
  }, [rotating, autoplay, state.index]);

  const togglePlaying = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    stepFromRef.current = null;
    if (endedRef.current) {
      endedRef.current = false;
      autoplayMovedRef.current = true;
      engineRef.current?.scrollTo(0);
    }
    setPlaying(true);
  };

  // The user's input anywhere in the deck but the toggle takes over the
  // deck's move, so its settle is announced. In the viewport, where a press,
  // wheel or key moves the deck, it also stops autoplay, as focus entering
  // the deck does, whatever the pointer type. Prev, Next and Dots stop it
  // when activated, as Safari does not focus a button on click.
  const userInput = ({ target }: { target: EventTarget }) => {
    const element = target as Element;
    if (element.closest('[data-carouseldeck-autoplay-toggle]')) return;
    if (viewportRef.current?.contains(element)) userMove();
    else takeOver();
  };

  /** The engine, for a move that is not autoplay's. */
  const takeOver = () => {
    autoplayMovedRef.current = false;
    stepFromRef.current = null;
    return engineRef.current;
  };

  /** The engine, for the user's move: it also stops autoplay. */
  const userMove = () => {
    if (autoplaying) setPlaying(false);
    return takeOver();
  };

  useImperativeHandle(
    handleRef,
    () => ({
      scrollTo: (index) => takeOver()?.scrollTo(index),
      next: () => takeOver()?.next(),
      prev: () => takeOver()?.prev()
    }),
    []
  );

  // Only the first render is unmeasured, so the walk runs once, and on the
  // server. Rendered from a server component, Root cannot recognise the
  // Viewport, a client reference here: the server component counted it.
  const serverSlides = use(ServerSlides);
  const slides =
    state.count === null
      ? (slidesIn(children, Viewport) ?? serverSlides)
      : null;

  // A deck nested in a slide counts its own slides.
  return (
    <ServerSlides value={null}>
      <DeckContext
        value={{
          ...state,
          slides,
          initialIndex,
          orientation,
          loop,
          viewportRef,
          engineRef,
          hasAutoplay: autoplaying,
          playing,
          togglePlaying,
          userMove
        }}
      >
        <div
          role="region"
          aria-roledescription="carousel"
          // Raw defaultIndex until measured: clamping needs the slide count.
          // Like each slide's data-current, the last settled position: it
          // trails a new `index` until the deck settles there.
          data-index={state.index}
          {...props}
          // Focus entering the deck stops autoplay until the toggle starts it
          // again (APG carousel); focus on the toggle itself does not.
          onFocus={(event) => {
            onFocus?.(event);
            // Focus entering a slide from outside it mid-move takes the move
            // over (ADR-0006), so its settle is announced.
            let slide = event.target as Element | null;
            while (slide && slide.parentElement !== viewportRef.current) {
              slide = slide.parentElement;
            }
            if (
              slide &&
              !slide.contains(event.relatedTarget as Node | null) &&
              engineRef.current?.target() != null
            ) {
              takeOver();
            }
            if (
              autoplaying &&
              !(event.target as Element).closest(
                '[data-carouseldeck-autoplay-toggle]'
              )
            ) {
              setPlaying(false);
            }
          }}
          onPointerEnter={(event) => {
            onPointerEnter?.(event);
            hoveredRef.current = true;
            if (autoplaying) setHovered(true);
          }}
          onPointerLeave={(event) => {
            onPointerLeave?.(event);
            hoveredRef.current = false;
            if (autoplaying) setHovered(false);
          }}
          onPointerDown={(event) => {
            onPointerDown?.(event);
            userInput(event);
          }}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            userInput(event);
          }}
          onWheel={(event) => {
            onWheel?.(event);
            userInput(event);
          }}
        >
          {children}
          {/* Announces the slide the deck moves to, unless autoplay started
            the move; off while autoplay rotates the deck (APG carousel).
            Empty until the deck first moves, so hydration announces
            nothing. */}
          <div
            aria-live={rotating ? 'off' : 'polite'}
            aria-atomic="true"
            data-carouseldeck-live=""
            style={visuallyHidden}
          >
            {announcement}
          </div>
        </div>
      </DeckContext>
    </ServerSlides>
  );
}

const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0
};

/** The viewport's slides: its children but snap targets, loop copies,
 * shells and spacers. */
const slideCount = (viewport: HTMLElement) =>
  [...viewport.children].filter(
    (child) =>
      !child.hasAttribute(SNAP_TARGET) &&
      !child.hasAttribute(COPY) &&
      !child.hasAttribute(SHELL) &&
      !child.hasAttribute(SPACER)
  ).length;

/** Warns about controlled-deck mistakes, as React does for an input's
 * `value`: once per deck instance for each kind, so one warning never hides
 * another. */
function useDevWarnings(
  index: number | undefined,
  defaultIndex: number | undefined,
  onIndexChange: ((index: number) => void) | undefined
) {
  const controlled = index !== undefined;
  const [wasControlled] = useState(controlled);
  const both = controlled && defaultIndex !== undefined;
  const switched = controlled !== wasControlled;
  const readOnly = controlled && onIndexChange === undefined;
  const warned = useRef(new Set<string>());
  useEffect(() => {
    const warn = (kind: string, message: string) => {
      if (warned.current.has(kind)) return;
      warned.current.add(kind);
      console.error(message);
    };
    if (both) {
      warn(
        'both',
        'Deck.Root takes either index or defaultIndex, not both. Pass index ' +
          'with onIndexChange for a controlled deck, or defaultIndex for an ' +
          'uncontrolled one.'
      );
    }
    if (switched) {
      warn(
        'switched',
        `Deck.Root is changing ${
          wasControlled
            ? 'a controlled deck to be uncontrolled'
            : 'an uncontrolled deck to be controlled'
        }. A deck should not switch between the two: choose index or ` +
          'defaultIndex for its whole life.'
      );
    }
    if (readOnly) {
      warn(
        'readOnly',
        'Deck.Root was given index without onIndexChange, so a scroll will ' +
          'return the deck to index. Pass onIndexChange to follow the ' +
          'scroll, or defaultIndex for an uncontrolled deck.'
      );
    }
  }, [both, switched, readOnly, wasControlled]);
}

const SlideContext = createContext<{
  index: number;
  count: number;
  /** Whether an effect stacks the slides in one place. */
  stacked: boolean;
  /** The effect's inline styles for each slide. */
  style: CSSProperties | undefined;
  /** The slide's progress as the deck starts, until the engine measures it. */
  progress: number;
  /** With shells (#144), the real slide's estimated starting slot, `k` sets
   * either side of its own, times the slide count: present only where `k`
   * is not 0. `Deck.Slide` turns it into a starting `translate`, over the
   * shell at that slot, the same way the engine's own placement will once
   * it mounts (decision 6; `deckDefaults` has the CSS). Undefined outside
   * shells, and at a slide's own slot. */
  placed?: number;
  /** A loop's copy of the slide, and which side of the slides it is on. */
  copy?: 'before' | 'after';
} | null>(null);

/** What `useSlide` reports about the slide it is called in. */
export interface UseSlideResult {
  /** The index of the slide, also in a loop's copy of it. */
  index: number;
  /** Which side of the slides a loop's copy is on; undefined in a slide. */
  copy: 'before' | 'after' | undefined;
}

/** The slide a component is rendered in: its index, and whether it is a
 * loop's copy, so stateful content, such as a video player, can render
 * differently in a copy, which is inert and never focal. Throws outside a
 * `Deck.Slide`. */
export function useSlide(): UseSlideResult {
  const slide = use(SlideContext);
  if (!slide) throw new Error('Deck.useSlide must be inside Deck.Slide');
  return { index: slide.index, copy: slide.copy };
}

/**
 * A transition built on progress while the viewport keeps scrolling natively
 * (GLOSSARY.md), passed to `Deck.Viewport`'s `effect`. Each effect is its own
 * entry point, such as `@carouseldeck/react/fade`, so a deck that imports none
 * ships none of their code.
 */
export interface Effect {
  /** Names the effect's stylesheet, so a page holds one copy of it. */
  name: string;
  /** The effect's appearance, read from `--deck-slide-progress` and the
   * slides' data attributes. Zero-specificity `:where()` rules, so consumer
   * CSS overrides any of them (ADR-0003). */
  css: string;
  /** The structural styles the effect needs, set inline as the deck's own
   * are, for a deck of `count` slides, a loop's copies included. With
   * `target`, the viewport holds an empty snap target per slide, and per
   * copy, in the order they run, after the slides, styled by it: the slides
   * stack in one place, the engine measures each by its target, and every
   * slide but the focal one is inert, as it cannot be seen. */
  layout?: (
    orientation: Orientation,
    count: number
  ) => {
    viewport?: CSSProperties;
    slide?: CSSProperties;
    target?: (index: number) => CSSProperties;
  };
}

export interface ViewportProps extends ComponentProps<'div'> {
  /** An effect, imported from its own entry point, such as `fade` from
   * `@carouseldeck/react/fade`. */
  effect?: Effect;
}

const viewportStyles: Record<Orientation, CSSProperties> = {
  horizontal: {
    display: 'flex',
    overflowX: 'auto',
    scrollSnapType: 'x mandatory'
  },
  vertical: {
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    scrollSnapType: 'y mandatory'
  }
};

/** The native scroll container. Its children are the deck's slides; with
 * `loop`, a copy of every slide on each side of them; an `effect` may add a
 * snap target after them for each. */
export function Viewport({ style, children, effect, ...props }: ViewportProps) {
  const { viewportRef, engineRef, orientation, loop, count, initialIndex } =
    useDeckContext('Viewport');
  // Staging switch for #144: shells instead of copies, for the new tests
  // only (not exported from the package entry). Deleted in Task 7.
  const shellsOn = use(LoopShells);
  const vertical = orientation === 'vertical';
  const slides = Children.toArray(children);
  // A deck whose slides all fit has nothing to loop (see createDeck).
  const looping = loop && !everySlideFits(count);
  const shells = looping && shellsOn;
  const copies = looping && !shellsOn;
  // Whether the effect stacks the slides in one place: known from calling
  // its layout once -- stacked or not never depends on the count passed
  // in, only the grid it draws does.
  const stacked =
    effect?.layout?.(orientation, slides.length)?.target !== undefined;
  // With shells, stacked (#144, Task 5): the shells are the effect's own
  // snap targets, one per shell rather than one per slide, so the run is
  // five full sets of them, never three copies (shells have no copies).
  const run = slides.length * (copies ? 3 : shells && stacked ? 5 : 1);
  const layout = effect?.layout?.(orientation, run);
  const target = layout?.target;
  // Each slide starts at its distance in slides from the slide the deck
  // starts at, a copy by its own place in the run, so server HTML paints
  // progress as the engine will once it measures (ADR-0011, #125).
  const start = clampSlide(initialIndex, slides.length);
  // With shells, not stacked (#144, Task 4; stacked is Task 5's), the slot
  // `k` a real slide starts placed at -- the shell, -2 to 2 sets either
  // side of its own, nearest where the deck starts -- mirrors the engine's
  // own `nearestSlot` on exact ties (ADR-0013): `k = clamp(floor((s - i) /
  // n + 0.5), -2, 2)`, `s` the starting slide, `i` the slide's own index,
  // `n` the slide count.
  const wrapped = shells && !stacked;
  const slotOf = (index: number) =>
    wrapped
      ? Math.max(
          -2,
          Math.min(2, Math.floor((start - index) / slides.length + 0.5))
        )
      : 0;
  // With shells, stacked (#144, Task 5): a slide is never translated onto
  // another slot -- it is sticky, always its own -- so its progress wraps
  // into the back of the stack instead, the maintainer's ruling on
  // ADR-0013's fork (`wrapStackedProgress`).
  const stackedShells = shells && stacked;
  // Adding or removing a slide, the copies or an effect's snap targets can
  // change the snap points without resizing the viewport, which is all the
  // engine observes. Where the copies or snap targets came or went, the
  // engine keeps the current index (ADR-0007, ADR-0009). A slide moved to a
  // new place is given its new place's starting progress, which the engine
  // then paints over.
  const order = slides
    .map((slide) => (isValidElement(slide) ? slide.key : ''))
    .join();
  useLayoutEffect(() => {
    engineRef.current?.refresh();
  }, [engineRef, slides.length, copies, shells, stacked, order]);
  const set = (copy?: 'before' | 'after') =>
    slides.map((slide, index) => {
      const slot = slotOf(index);
      return (
        // `toArray` gives every element a key derived from the consumer's,
        // so a reordered slide moves instead of remounting.
        <SlideContext
          key={isValidElement(slide) ? slide.key : index}
          value={{
            index,
            count: slides.length,
            stacked,
            // The copies before the slides come after them in the document,
            // so a consumer's `:nth-child()` still counts the slides from 1.
            style:
              copy === 'before'
                ? { ...layout?.slide, order: -1 }
                : layout?.slide,
            progress: stackedShells
              ? wrapStackedProgress(index - start, slides.length)
              : index -
                start +
                (copy === 'after'
                  ? slides.length
                  : copy
                    ? -slides.length
                    : slot * slides.length),
            placed:
              !stackedShells && slot !== 0 ? slot * slides.length : undefined,
            copy
          }}
        >
          {slide}
        </SlideContext>
      );
    });
  return (
    <div
      ref={viewportRef}
      tabIndex={0}
      data-carouseldeck-viewport=""
      data-orientation={orientation}
      data-carouseldeck-effect={effect?.name}
      data-carouseldeck-loop={
        looping ? (shells ? 'shells' : 'copies') : undefined
      }
      style={{
        ...viewportStyles[orientation],
        ...layout?.viewport,
        ...style
      }}
      {...props}
    >
      <style href="carouseldeck-slide" precedence="carouseldeck">
        {deckDefaults}
      </style>
      {effect && (
        <style href={`carouseldeck-${effect.name}`} precedence="carouseldeck">
          {effect.css}
        </style>
      )}
      {set()}
      {copies && <Fragment key="after">{set('after')}</Fragment>}
      {copies && <Fragment key="before">{set('before')}</Fragment>}
      {shells && !stacked && (
        <div
          data-carouseldeck-spacer="before"
          aria-hidden="true"
          style={spacerStyle(true, slides.length)}
        />
      )}
      {shells && !stacked && (
        <div
          data-carouseldeck-spacer="after"
          aria-hidden="true"
          style={spacerStyle(false, slides.length)}
        />
      )}
      {shells &&
        !stacked &&
        SHELL_SETS.flatMap((shellSet) =>
          Array.from({ length: slides.length }, (_, index) => (
            <div
              key={`shell:${shellSet}:${index}`}
              data-carouseldeck-shell={shellSet}
              aria-hidden="true"
              inert
              style={{
                ...shellStyle,
                // Estimated home, decision 6: exact under the default
                // layout (slides 100% of the viewport, no gap), where the
                // before-spacer's own estimate, below, holds too. Shells
                // carry no content, so only this inset is estimated, never
                // their size, which the engine alone measures.
                [vertical ? 'insetBlockStart' : 'insetInlineStart']:
                  `${((shellSet + 2) * slides.length + index) * 100}%`
              }}
            />
          ))
        )}
      {/* With shells, stacked (#144, Task 5): the shells are the effect's
          own snap targets, one grid cell each, five full sets of them.
          They carry no estimated geometry of their own -- the grid places
          them exactly, so there is nothing for hydration to correct -- and
          no spacer, no out-of-flow position and no alignment copied onto
          them: `target`'s own style is every bit of layout they need. */}
      {stackedShells &&
        SHELL_SETS.flatMap((shellSet) =>
          Array.from({ length: slides.length }, (_, index) => (
            <div
              key={`shell:${shellSet}:${index}`}
              data-carouseldeck-shell={shellSet}
              data-carouseldeck-snap-target=""
              aria-hidden="true"
              inert
              style={target?.((shellSet + 2) * slides.length + index)}
            />
          ))
        )}
      {target &&
        !stackedShells &&
        Array.from({ length: run }, (_, index) => (
          <div
            key={`target-${index}`}
            aria-hidden="true"
            data-carouseldeck-snap-target=""
            style={target(index)}
          />
        ))}
    </div>
  );
}

/** Shells' five sets, -2 to 2, 0 being the real slides' own (ADR-0013). */
const SHELL_SETS = [-2, -1, 0, 1, 2] as const;

/** A shell: an empty, inert, `aria-hidden` stand-in for a slide, out of
 * flow, sized and positioned by the engine. Neutralised against any
 * consumer CSS that would otherwise size or paint a wildcard-selected
 * child (ADR-0013). `scroll-snap-align` is `none` until the engine copies
 * the real slide's own onto it (decision 7): a wildcard consumer rule must
 * not make an unmeasured shell a snap target. */
const shellStyle = {
  position: 'absolute',
  margin: 0,
  padding: 0,
  border: 0,
  scale: 'none',
  rotate: 'none',
  translate: 'none',
  opacity: 0,
  pointerEvents: 'none',
  scrollSnapAlign: 'none'
} as CSSProperties;

/** One of shells' two in-flow spacers, before the real slides or after
 * them: pushes them two sets in, so the shells before them have somewhere
 * to sit (ADR-0013), sized by the engine once it mounts. Its own SSR
 * estimate (decision 6: `2L - gap`, exact under the default layout) is a
 * `flex-basis`, never a `flex` shorthand: an inline `flex` would bake in
 * its own `flex-basis: auto`, which no stylesheet rule, zero specificity or
 * not, can then override (inline always beats a stylesheet). The
 * after-spacer's is inline, straight; the before-spacer's is a custom
 * property, which `deckDefaults` turns into `flex-basis` only where the
 * browser honours `scroll-initial-target` (see there), so elsewhere it
 * keeps today's pre-hydration behaviour, slide 0 at scroll 0, with no
 * inline `flex-basis` of its own to out-rank that absence. */
const spacerStyle = (before: boolean, count: number) =>
  ({
    ...(before && { order: -1 }),
    flexGrow: 0,
    flexShrink: 0,
    margin: 0,
    padding: 0,
    border: 0,
    scale: 'none',
    rotate: 'none',
    translate: 'none',
    opacity: 0,
    pointerEvents: 'none',
    scrollSnapAlign: 'none',
    ...(before
      ? { '--carouseldeck-spacer-estimate': `${2 * count * 100}%` }
      : { flexBasis: `${2 * count * 100}%` })
  }) as CSSProperties;

// A slide's size and alignment are geometry, which belongs to consumer CSS
// (ADR-0003). These defaults make a deck work with no stylesheet, and their
// zero specificity lets any consumer rule override them, which inline styles
// would not. The viewport's scrollbar is hidden too, and it still scrolls:
// `scrollbar-width: none` has zero specificity like the rest. Only an engine
// without `scrollbar-width` gets `::-webkit-scrollbar`, as Chromium honours
// the pseudo-element while `scrollbar-width` is `auto`, and a consumer's
// `scrollbar-width: auto` alone would not restore it. The pseudo-element
// makes that rule (0,0,1), so a consumer's
// `[data-carouseldeck-viewport]::-webkit-scrollbar` still wins.
const deckDefaults =
  ':where([data-carouseldeck-slide]){width:100%;scroll-snap-align:start}' +
  ':where([data-orientation=vertical]>[data-carouseldeck-slide]){height:100%}' +
  ':where([data-carouseldeck-viewport]){scrollbar-width:none}' +
  // Shells (ADR-0013) are absolutely positioned by the engine: the
  // viewport becomes their containing block, unless the consumer already
  // gives it a non-static position.
  ':where([data-carouseldeck-loop=shells]){position:relative}' +
  // A real slide's SSR estimate (#144, decision 6): placed `k` sets away
  // from its own, before the engine measures, translated by `k` set
  // lengths -- `--carouseldeck-placed`, `k * n` -- exact under the default
  // layout (decision 6). Horizontal, then its right-to-left flip, then
  // vertical: equal, zero specificity (ADR-0003), so each later rule wins
  // for the decks it is about.
  ':where([data-carouseldeck-placed]){translate:calc(var(--carouseldeck-placed) * 100%) 0}' +
  ':where([data-carouseldeck-placed]:dir(rtl)){translate:calc(var(--carouseldeck-placed) * -100%) 0}' +
  ':where([data-orientation=vertical]>[data-carouseldeck-placed]){translate:0 calc(var(--carouseldeck-placed) * 100%)}' +
  // The before-spacer's own SSR estimate (decision 6), only where the
  // browser honours `scroll-initial-target`: elsewhere -- Firefox and
  // Safari, at the time of writing -- the spacer takes no space, and
  // slide 0 paints at scroll 0, as a plain deck already does before
  // hydration.
  '@supports (scroll-initial-target: nearest) {' +
  ':where([data-carouseldeck-spacer="before"]){flex-basis:var(--carouseldeck-spacer-estimate)}' +
  '}' +
  '@supports not (scrollbar-width:none){' +
  ':where([data-carouseldeck-viewport])::-webkit-scrollbar{display:none}}';

// Not yet in React's CSSProperties.
const initialTarget = { scrollInitialTarget: 'nearest' } as CSSProperties;

/** One slide, labelled "n of m". Its size and alignment are consumer CSS.
 * For CSS to read, it carries `--deck-slide-index`, its index, and
 * `--deck-slide-count`, the number of slides, copies not counted, from the
 * first render; `--deck-slide-progress`, its signed distance from the focal
 * position in slides, from the first render too, server HTML included,
 * counted from the slide the deck starts at; and once mounted, `data-in-view` while any of
 * it is in view. Progress and in-view are kept up to date as the deck scrolls
 * without a React render. Where an effect stacks the slides, as fade does, every slide but the focal
 * one is inert. */
export function Slide({ style, ...props }: ComponentProps<'div'>) {
  const deck = useDeckContext('Slide');
  const slide = use(SlideContext);
  if (!slide) throw new Error('Deck.Slide must be inside Deck.Viewport');
  const { index, count, stacked, copy } = slide;
  const start = !copy && index === clampSlide(deck.initialIndex, count);
  // Until the viewport is measured, the slide it starts at.
  const current = !copy && (deck.slide === null ? start : index === deck.slide);
  const focal = !copy && (deck.focal === null ? start : index === deck.focal);
  // Stacked, only the focal slide can be seen, so only it can be reached. A
  // loop's copy can never be reached, nor announced.
  const inert = copy !== undefined || (stacked && !focal);
  const { viewportRef } = deck;
  // Focus in a slide that goes inert would drop to the body: it moves to the
  // viewport instead, where arrow keys still move the deck.
  useLayoutEffect(() => {
    if (!inert) return;
    const viewport = viewportRef.current;
    const focused = document.activeElement?.closest(
      '[data-carouseldeck-slide][inert]'
    );
    if (viewport && focused?.parentElement === viewport) {
      viewport.focus({ preventScroll: true });
    }
  }, [inert, viewportRef]);
  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${count}`}
      data-carouseldeck-slide=""
      data-carouseldeck-copy={copy}
      data-carouseldeck-placed={slide.placed !== undefined ? '' : undefined}
      aria-hidden={copy ? true : undefined}
      data-current={current ? '' : undefined}
      data-focal={focal ? '' : undefined}
      inert={inert}
      style={{
        flexShrink: 0,
        // A slide's place in the deck, for CSS such as an entry stagger, and
        // the number of slides, copies not counted. Static, so server HTML
        // has them; the engine writes the values that change as the deck
        // scrolls (`--deck-slide-progress`, `data-in-view`).
        ...({
          '--deck-slide-index': index,
          '--deck-slide-count': count
        } as CSSProperties),
        // Its progress as the deck starts, so server HTML paints progress
        // before the engine measures (ADR-0011, #125). The engine writes the
        // same property as the deck moves, and React writes a style only
        // where its value differs from React's last render. This one
        // derives from the frozen initial index and the slide's place in the
        // order only, so React never rewrites it mid-scroll; where the order
        // changes, Viewport refreshes the engine, which paints over it.
        ...({ '--deck-slide-progress': slide.progress } as CSSProperties),
        // With shells, placed over a shell other than its own before the
        // engine measures: `deckDefaults` turns this into the same
        // `translate` the engine's own placement would write (#144,
        // decision 6).
        ...(slide.placed !== undefined &&
          ({ '--carouseldeck-placed': slide.placed } as CSSProperties)),
        // Server HTML paints at defaultIndex before any script runs, where
        // supported; elsewhere Root's layout effect scrolls before paint.
        // Exact with one slide per snap point; see createDeck's mount.
        ...(start && initialTarget),
        ...slide.style,
        ...style
      }}
      {...props}
    />
  );
}

/** One snap point, or none, means there is nowhere to go: Prev, Next, Dots
 * and Counter are then absent. The server cannot measure, so it renders Prev
 * and Next as if the slides overflow, the common case: a deck whose slides all
 * fit drops them at hydration, which shifts layout. */
const everySlideFits = (count: number | null) => count !== null && count <= 1;

/** What `useDeck` reports about the deck it is called in. */
export interface UseDeckResult {
  /** The current index: the snap point the deck rests at, a page when it
   * snaps in pages. Until the viewport is measured, the index it starts at,
   * clamped to the slides, as Counter shows it. */
  index: number;
  /** The snap points, so the pages; null until the viewport is measured, as
   * on the server. */
  count: number | null;
  /** Whether `Deck.Root` has `loop`. */
  loop: boolean;
  /** Whether every slide fits, so there is nowhere to go: Prev, Next, Dots,
   * Counter and AutoplayToggle are then absent. False until the viewport is
   * measured. */
  fits: boolean;
  /** Whether `prev()` can move the deck: when `Deck.Prev` is enabled. */
  canPrev: boolean;
  /** Whether `next()` can move the deck: when `Deck.Next` is enabled. */
  canNext: boolean;
  /** Scrolls to a snap point, clamped to the snap points there are. */
  scrollTo(index: number): void;
  /** Scrolls one snap point on. */
  next(): void;
  /** Scrolls one snap point back. */
  prev(): void;
}

/** The deck's state and moves, for `useDeck` and the primitives that read
 * the same: Prev and Next. Before measurement the index is clamped to the
 * slides Root can see, as `usePages` clamps it for Dots and Counter. */
function useDeckState(primitive: string): UseDeckResult {
  const deck = useDeckContext(primitive);
  const { count, slides, loop, userMove } = deck;
  const index =
    count === null && slides
      ? clampSlide(deck.initialIndex, slides)
      : deck.index;
  const fits = everySlideFits(count);
  return {
    index,
    count,
    loop,
    fits,
    canPrev: !fits && (loop || index !== 0),
    canNext: !fits && (loop || count === null || index < count - 1),
    scrollTo: (to) => userMove()?.scrollTo(to),
    next: () => userMove()?.next(),
    prev: () => userMove()?.prev()
  };
}

/** The deck a component is rendered in: its state, as Prev and Next read it,
 * and Dots and Counter once the viewport is measured, and its moves, so a
 * consumer can build those controls from their own components. A move stops
 * autoplay, as a built-in control's does. Like the primitives, it never
 * re-renders while the deck scrolls (ADR-0003): it re-renders whenever
 * `Deck.Root` does, as when the deck settles somewhere new, its snap points
 * change or, with `autoplay`, autoplay starts, stops or pauses. Throws
 * outside a `Deck.Root`. */
export function useDeck(): UseDeckResult {
  return useDeckState('useDeck');
}

interface StepButtonProps extends ComponentProps<'button'> {
  atEnd: boolean;
  step: () => void;
  label: string;
}

/** A consumer's `onClick` runs first and can cancel the step with
 * `preventDefault()`; a consumer's `disabled` can disable the button but not
 * enable it at its end. */
function StepButton({
  atEnd,
  step,
  label,
  onClick,
  disabled,
  children,
  ...props
}: StepButtonProps) {
  return (
    <button
      type="button"
      {...props}
      disabled={atEnd || disabled}
      data-disabled={atEnd || disabled ? '' : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) step();
      }}
    >
      {children ?? label}
    </button>
  );
}

/** Moves the deck one snap point back. Disabled at the first unless the deck
 * loops; absent when every slide fits. Marked `data-carouseldeck-prev` for CSS
 * to select. */
export function Prev(props: ComponentProps<'button'>) {
  const { fits, canPrev, prev } = useDeckState('Prev');
  if (fits) return null;
  return (
    <StepButton
      {...props}
      data-carouseldeck-prev=""
      atEnd={!canPrev}
      step={prev}
      label="Previous"
    />
  );
}

/** Moves the deck one snap point on. Disabled at the last unless the deck
 * loops; absent when every slide fits. Marked `data-carouseldeck-next` for CSS
 * to select. */
export function Next(props: ComponentProps<'button'>) {
  const { fits, canNext, next } = useDeckState('Next');
  if (fits) return null;
  return (
    <StepButton
      {...props}
      data-carouseldeck-next=""
      atEnd={!canNext}
      step={next}
      label="Next"
    />
  );
}

/** The pages Dots and Counter show: the snap points, once measured. Before,
 * as on the server, a page per slide, the common case, so server HTML is exact
 * there; a deck whose snap points differ corrects at hydration (ADR-0003).
 * `count` is null only where Root cannot see Viewport's slides. */
function usePages(primitive: string) {
  const { index, count, slides, initialIndex, userMove } =
    useDeckContext(primitive);
  if (count !== null || slides === null) return { index, count, userMove };
  return { index: clampSlide(initialIndex, slides), count: slides, userMove };
}

/** A labelled group of buttons, one per page: one per snap point, so with
 * several slides in a page a dot stands for the page, not a slide (ADR-0004).
 * The current one carries `aria-current`; the group's data attributes are the
 * deck's state, which a consumer's cannot overwrite. Absent when every slide
 * fits. */
export function Dots(props: Omit<ComponentProps<'div'>, 'children'>) {
  const { index, count, userMove } = usePages('Dots');
  if (everySlideFits(count)) return null;
  return (
    <div
      role="group"
      aria-label="Choose page"
      {...props}
      data-carouseldeck-dots=""
      data-index={count === null ? undefined : index}
      data-count={count ?? undefined}
    >
      {Array.from({ length: count ?? 0 }, (_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`Go to page ${i + 1}`}
          aria-current={i === index ? 'true' : undefined}
          data-index={i}
          onClick={() => userMove()?.scrollTo(i)}
        />
      ))}
    </div>
  );
}

/** The current page and the total, as "3 / 10": counts pages, as Dots do.
 * Absent when every slide fits. Not a live region: each slide is already
 * labelled "n of m". Its data attributes are the deck's state, which
 * a consumer's cannot overwrite. */
export function Counter(props: Omit<ComponentProps<'span'>, 'children'>) {
  const { index, count } = usePages('Counter');
  if (everySlideFits(count)) return null;
  const known = count !== null;
  return (
    <span
      {...props}
      data-carouseldeck-counter=""
      data-index={known ? index : undefined}
      data-count={known ? count : undefined}
    >
      {known && `${index + 1} / ${count}`}
    </span>
  );
}

/**
 * Stops and starts `Deck.Root`'s `autoplay`, so motion can always be stopped
 * (WCAG 2.2.2). Its name is the action it takes, "Stop slide rotation" or
 * "Start slide rotation", rather than `aria-pressed` (APG carousel); it is
 * marked `data-playing` while autoplay is on, paused by a pointer or not.
 * Children replace the visible name: give both states, shown by
 * `data-playing` in CSS. Place it first among the deck's controls, ahead of
 * the slides, so keyboard users reach it before the moving content. Focus on
 * it does not stop autoplay, so it can be pressed. Starting autoplay where it
 * stopped at the last snap point rewinds to the first. A consumer's
 * `onClick` runs first and can cancel the toggle with `preventDefault()`.
 * Absent without `autoplay`, and when every slide fits.
 */
export function AutoplayToggle({
  onClick,
  children,
  ...props
}: ComponentProps<'button'>) {
  const { hasAutoplay, playing, togglePlaying, count } =
    useDeckContext('AutoplayToggle');
  if (!hasAutoplay || everySlideFits(count)) return null;
  return (
    <button
      type="button"
      {...props}
      data-carouseldeck-autoplay-toggle=""
      data-playing={playing ? '' : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) togglePlaying();
      }}
    >
      {children ?? (playing ? 'Stop slide rotation' : 'Start slide rotation')}
    </button>
  );
}
