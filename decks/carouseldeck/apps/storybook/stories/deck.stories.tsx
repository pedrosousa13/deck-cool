import { useRef, useState } from 'react';
import * as Deck from '@carouseldeck/react';
import { curve } from '@carouseldeck/react/curve';
import { fade } from '@carouseldeck/react/fade';
import { stack } from '@carouseldeck/react/stack';
import theme from '@carouseldeck/react/theme.css?inline';
import type { Meta, StoryObj } from '@storybook/react-vite';
import clip from './assets/clip.webm';
import { eventLog } from './event-log';
import { VideoDeck } from './video-deck';

const slidesOf = (count: number) =>
  Array.from({ length: count }, (_, i) => (
    <Deck.Slide key={i} className="slide">
      <p>Slide {i + 1}</p>
      <button type="button">Action {i + 1}</button>
    </Deck.Slide>
  ));

const slides = slidesOf(6);

const meta = {
  title: 'Deck',
  component: Deck.Root,
  args: { 'aria-label': 'Featured slides', defaultIndex: 0 },
  render: (args) => (
    <Deck.Root {...args}>
      <Deck.Viewport className="viewport">{slides}</Deck.Viewport>
      <Deck.Prev />
      <Deck.Next />
      <Deck.Dots />
      <Deck.Counter />
    </Deck.Root>
  )
} satisfies Meta<typeof Deck.Root>;

export default meta;

type Story = StoryObj<typeof meta>;

/** No stylesheet at all: one full-width slide per snap point. */
export const Default: Story = {};

/**
 * Slides per view, gap and alignment are the consumer's CSS: here two and a
 * half slides in view, a 16px gap, and slides centred on the snap point.
 */
export const Peek: Story = {
  decorators: [
    (Story) => (
      <>
        <style>{`
          .viewport { gap: 16px; }
          .slide {
            width: calc((100% - 2 * 16px) / 2.5);
            scroll-snap-align: center;
            background: #eef;
          }
        `}</style>
        <Story />
      </>
    )
  ]
};

/** Starts at the third slide, on the server and in the browser. */
export const StartingIndex: Story = { args: { defaultIndex: 2 } };

function ControlledDeck() {
  const [index, setIndex] = useState(0);
  return (
    <>
      <Deck.Root
        aria-label="Featured slides"
        index={index}
        onIndexChange={setIndex}
      >
        <Deck.Viewport className="viewport">{slides}</Deck.Viewport>
      </Deck.Root>
      <div role="group" aria-label="Go to slide">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </>
  );
}

/** The index lives in the parent's state, like a controlled input's value:
 * the buttons set it, and scrolling the deck updates it. */
export const Controlled: Story = { render: () => <ControlledDeck /> };

function ThumbnailDecks() {
  const [index, setIndex] = useState(0);
  const thumbs = useRef<(HTMLButtonElement | null)[]>([]);
  const goTo = (i: number) => {
    setIndex(i);
    const thumb = thumbs.current[i];
    const strip = thumb?.closest<HTMLElement>('[data-carouseldeck-viewport]');
    if (thumb && strip) {
      const t = thumb.getBoundingClientRect();
      const s = strip.getBoundingClientRect();
      strip.scrollBy({
        left: Math.min(0, t.left - s.left) || Math.max(0, t.right - s.right),
        top: Math.min(0, t.top - s.top) || Math.max(0, t.bottom - s.bottom)
      });
    }
  };
  return (
    <div className="synced">
      <style>{`
        .synced .thumbs .viewport { gap: 8px; }
        .synced .thumbs .slide { width: calc((100% - 3 * 8px) / 4); }
        .synced .thumbs button {
          width: 100%;
          padding: 1.5rem 0;
          border: 2px solid transparent;
          background: #eef;
        }
        .synced .thumbs button[aria-current] { border-color: #335; }
      `}</style>
      <Deck.Root
        aria-label="Featured slides"
        index={index}
        onIndexChange={goTo}
      >
        <Deck.Viewport className="viewport">{slidesOf(8)}</Deck.Viewport>
        <Deck.Prev />
        <Deck.Next />
      </Deck.Root>
      <Deck.Root aria-label="Thumbnails" className="thumbs">
        <Deck.Viewport className="viewport">
          {Array.from({ length: 8 }, (_, i) => (
            <Deck.Slide key={i} className="slide">
              <button
                ref={(button) => {
                  thumbs.current[i] = button;
                }}
                type="button"
                aria-current={i === index ? 'true' : undefined}
                onClick={() => goTo(i)}
              >
                Slide {i + 1}
              </button>
            </Deck.Slide>
          ))}
        </Deck.Viewport>
      </Deck.Root>
    </div>
  );
}

/**
 * Two decks sharing state: a thumbnail strip drives a main deck and follows
 * it back. There is no sync feature; the main deck's current index is the
 * parent's state, as in Controlled.
 *
 * ```tsx
 * const [index, setIndex] = useState(0);
 * const thumbs = useRef<(HTMLButtonElement | null)[]>([]);
 * const goTo = (i: number) => {
 *   setIndex(i);
 *   const thumb = thumbs.current[i];
 *   const strip = thumb?.closest<HTMLElement>('[data-carouseldeck-viewport]');
 *   if (thumb && strip) {
 *     const t = thumb.getBoundingClientRect();
 *     const s = strip.getBoundingClientRect();
 *     strip.scrollBy({
 *       left: Math.min(0, t.left - s.left) || Math.max(0, t.right - s.right),
 *       top: Math.min(0, t.top - s.top) || Math.max(0, t.bottom - s.bottom)
 *     });
 *   }
 * };
 *
 * <>
 *   <Deck.Root aria-label="Featured slides" index={index} onIndexChange={goTo}>
 *     <Deck.Viewport>{slides}</Deck.Viewport>
 *   </Deck.Root>
 *   <Deck.Root aria-label="Thumbnails">
 *     <Deck.Viewport>
 *       {slides.map((_, i) => (
 *         <Deck.Slide key={i}>
 *           <button
 *             ref={(button) => { thumbs.current[i] = button; }}
 *             type="button"
 *             aria-current={i === index ? 'true' : undefined}
 *             onClick={() => goTo(i)}
 *           >
 *             Slide {i + 1}
 *           </button>
 *         </Deck.Slide>
 *       ))}
 *     </Deck.Viewport>
 *   </Deck.Root>
 * </>
 * ```
 *
 * The main deck is controlled: a thumbnail sets `index` and the deck scrolls
 * there, and a scroll of the main deck reports through `onIndexChange`, which
 * marks the thumbnail for the current slide with `aria-current`.
 *
 * The strip is uncontrolled and has no `onIndexChange`. Its index is the snap
 * point its viewport rests at, with several thumbnails in view, not the
 * current slide, so it scrolls freely and never feeds back into the main
 * deck. To follow the main deck it scrolls the thumbnail for the current
 * slide into view, nearest edge first, so a thumbnail already in view leaves
 * the strip where it is.
 *
 * It scrolls the strip's viewport by hand rather than calling `scrollTo` on
 * the strip's `handleRef`, which aligns to a snap point and moves the strip even when the
 * thumbnail is in view. It does not use `scrollIntoView` either, which also
 * scrolls the page to the strip when the strip is off-screen.
 *
 * Without CSS the strip shows one full-width thumbnail per view; set slides
 * per view on the strip's slides, as in Peek.
 *
 * Each thumbnail is a button named for its slide, so a screen reader hears
 * "Slide 3, button, current". Clicking one leaves focus on it; the main deck
 * announces the slide it moves to.
 */
export const Thumbnails: Story = { render: () => <ThumbnailDecks /> };

/**
 * Snapping in pages of several slides is consumer CSS too: only the first
 * slide of each page is a snap target, so Prev and Next move a page, and Dots
 * and Counter count pages. Each slide is still labelled "n of 10".
 *
 * Here one slide per page on narrow screens, and three in view, three to a
 * page, from 640px. Give both rules of a page size the same specificity, as
 * below, so the one in a later media query overrides every slide's alignment.
 * Carouseldeck re-reads the pages when the window resizes. The server cannot
 * measure, so it renders a page per slide, and a paged deck corrects its
 * Dots and Counter at hydration.
 */
export const Pages: Story = {
  decorators: [
    (Story) => (
      <>
        <style>{`
          @media (min-width: 640px) {
            .slide { width: calc(100% / 3); }
            .slide:nth-child(3n + 1) { scroll-snap-align: start; }
            .slide:not(:nth-child(3n + 1)) { scroll-snap-align: none; }
          }
        `}</style>
        <Story />
      </>
    )
  ],
  render: (args) => (
    <Deck.Root {...args}>
      <Deck.Viewport className="viewport">{slidesOf(10)}</Deck.Viewport>
      <Deck.Prev />
      <Deck.Next />
      <Deck.Dots />
      <Deck.Counter />
    </Deck.Root>
  )
};

/**
 * A mouse can drag the deck; it settles on a snap point when it lets go, and
 * a drag never clicks the link it started on. A plain click still follows it.
 * Touch, pen and trackpad scroll natively. Turn drag off with `drag={false}`.
 */
export const Drag: Story = {
  args: { drag: true },
  render: (args) => (
    <Deck.Root {...args}>
      <Deck.Viewport className="viewport">
        {Array.from({ length: 6 }, (_, i) => (
          <Deck.Slide key={i} className="slide">
            <a
              href={`#article-${i + 1}`}
              style={{ display: 'block', padding: '4rem 1rem' }}
            >
              Article {i + 1}
            </a>
          </Deck.Slide>
        ))}
      </Deck.Viewport>
      <Deck.Prev />
      <Deck.Next />
    </Deck.Root>
  )
};

/**
 * The focal slide is the one at the snap alignment point (here the slides
 * use `scroll-snap-align: center`), marked `data-focal` for CSS and reported
 * by `onFocalChange`. With several slides in view it is not the current
 * slide, which is the first slide resting at the snap point. With
 * `clickToFocus`, clicking a slide brings it to the snap alignment point, as
 * near as the scroll range allows; it is off by default.
 */
export const ClickToFocus: Story = {
  args: { clickToFocus: true },
  decorators: [
    (Story) => (
      <>
        <style>{`
          .viewport { gap: 16px; }
          .slide {
            width: calc((100% - 2 * 16px) / 2.5);
            scroll-snap-align: center;
            background: #eef;
            opacity: 0.6;
          }
          .slide[data-focal] { opacity: 1; outline: 2px solid #335; }
        `}</style>
        <Story />
      </>
    )
  ],
  render: (args) => (
    <Deck.Root {...args}>
      <Deck.Viewport className="viewport">
        {Array.from({ length: 6 }, (_, i) => (
          <Deck.Slide key={i} className="slide">
            <p>Card {i + 1}</p>
          </Deck.Slide>
        ))}
      </Deck.Viewport>
      <Deck.Prev />
      <Deck.Next />
    </Deck.Root>
  )
};

/**
 * A full-height vertical feed: `orientation="vertical"` scrolls and snaps on
 * the block axis, and Prev and Next step up and down. The viewport's height
 * is the consumer's CSS; each slide fills it by default.
 */
export const Vertical: Story = {
  args: { orientation: 'vertical' },
  decorators: [
    (Story) => (
      <>
        <style>{`.viewport { height: 240px; }`}</style>
        <Story />
      </>
    )
  ]
};

/**
 * In a right-to-left document the deck follows the writing direction, which
 * it reads from any ancestor's `dir`: it starts at the right, Next moves
 * toward the inline end on the left, a mouse drag to the right moves on, and
 * the arrow keys scroll the focused viewport the way the page reads.
 */
export const RightToLeft: Story = {
  decorators: [
    (Story) => (
      <div dir="rtl">
        <Story />
      </div>
    )
  ]
};

/** A story's decorators, then the event log, which `log=1` in the URL turns
 * on (see `eventLog`). */
const withLog = (decorators: Story['decorators']) =>
  [decorators ?? [], eventLog].flat();

/**
 * With `loop`, scrolling past the last slide arrives at the first, and back:
 * Prev and Next are never disabled, and a drag, a flick or a wheel crosses the
 * seam. Each slide mounts once (ADR-0013): the viewport moves the slide
 * nearest it onto whichever of five sets of empty, inert shells, hidden from
 * assistive technology, is nearest; when the deck comes to rest on one it
 * jumps, unseen, back onto the identical slide's own. Here two and a half
 * slides are in view, centred, so slide 6, placed a set before slide 1,
 * peeks in before it. Indexes, Dots and Counter count the slides only.
 */
export const Loop: Story = {
  args: { loop: true },
  decorators: withLog(Peek.decorators)
};

/** Loop in pages of three over ten slides, as in Pages: the last page holds
 * one slide, and Next from it goes on to the first page. */
export const LoopPages: Story = {
  ...Pages,
  args: { loop: true },
  decorators: withLog(Pages.decorators)
};

/** Loop on a vertical deck: Next on the last slide steps down to the first. */
export const LoopVertical: Story = {
  ...Vertical,
  args: { orientation: 'vertical', loop: true },
  decorators: withLog(Vertical.decorators)
};

/** Loop in a right-to-left document: past the last slide, at the left, is the
 * first. */
export const LoopRightToLeft: Story = {
  ...RightToLeft,
  args: { loop: true },
  decorators: withLog(RightToLeft.decorators)
};

/**
 * Effects in CSS alone. Each slide carries `--deck-slide-progress`, its
 * signed distance from the focal position in slides (0 at the focal
 * position, negative before it, positive after), updated every frame as the
 * deck scrolls without a React render. Here it scales the slides down as they
 * leave the centre: scale about the snap alignment point, here the centre,
 * so the effect does not move the point progress is measured from.
 *
 * `data-in-view` and progress stagger an entry: a slide's card animates in
 * each time the slide comes into view, delayed 100ms for each slide it sits
 * past the focal position (none before it, at most 300ms). So the slides in
 * view together enter in order from the start; a slide brought in by Next
 * waits a little, and one brought in by Prev does not. `--deck-slide-index`,
 * the slide's fixed place in the deck, sets which way its card enters: even
 * slides rise, odd slides drop. `data-in-view` hides nothing, and server
 * HTML has none, so the entry starts at hydration. Both effects are off under
 * reduced motion.
 */
export const Progress: Story = {
  decorators: [
    (Story) => (
      <>
        <style>{`
          .effects .viewport { gap: 16px; }
          .effects .slide {
            width: calc((100% - 2 * 16px) / 2.5);
            scroll-snap-align: center;
            background: #eef;
            /* abs() spelled with max() for older browsers. */
            scale: calc(
              1 -
                min(
                  max(var(--deck-slide-progress), -1 * var(--deck-slide-progress)),
                  1
                ) *
                0.2
            );
          }
          .effects .slide[data-in-view] .card {
            animation: enter 400ms ease-out both;
            animation-delay: calc(
              clamp(0, var(--deck-slide-progress), 3) * 100ms
            );
          }
          @keyframes enter {
            from {
              opacity: 0;
              translate: 0
                calc((1 - 2 * mod(var(--deck-slide-index), 2)) * 1rem);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .effects .slide { scale: none; }
            .effects .slide[data-in-view] .card { animation: none; }
          }
        `}</style>
        <div className="effects">
          <Story />
        </div>
      </>
    )
  ],
  render: (args) => (
    <Deck.Root {...args}>
      <Deck.Viewport className="viewport">
        {Array.from({ length: 6 }, (_, i) => (
          <Deck.Slide key={i} className="slide">
            <div className="card">
              <p>Card {i + 1}</p>
            </div>
          </Deck.Slide>
        ))}
      </Deck.Viewport>
      <Deck.Prev />
      <Deck.Next />
    </Deck.Root>
  )
};

/**
 * A hero that crossfades. `effect={fade}`, imported from
 * `@carouseldeck/react/fade`, stacks the slides in place: the viewport still
 * scrolls, snaps and drags natively, and each slide's opacity follows its
 * progress, so a swipe or a drag crossfades as far as it goes. Only the slide
 * shown can be reached; the others are inert. Each slide fills the viewport,
 * so group snapping does not apply. Under reduced motion there is no
 * crossfade: the slide shown cuts to the next halfway there, and Next jumps.
 * A deck that does not import the effect ships none of its code.
 */
export const Fade: Story = {
  decorators: [
    (Story) => (
      <>
        <style>{`
          .hero .slide {
            display: grid;
            place-content: center;
            min-height: 240px;
            background: #eef;
          }
          .hero .slide:nth-child(even) { background: #fee; }
        `}</style>
        <div className="hero">
          <Story />
        </div>
      </>
    )
  ],
  render: (args) => (
    <Deck.Root {...args}>
      <Deck.Viewport className="viewport" effect={fade}>
        {slidesOf(4)}
      </Deck.Viewport>
      <Deck.Prev />
      <Deck.Next />
      <Deck.Dots />
    </Deck.Root>
  )
};

/**
 * A stack of cards. `effect={stack}`, imported from `@carouseldeck/react/stack`,
 * stacks the slides in place as fade does, and orders them by progress: the
 * focal slide on top, the slides after it behind it, and a slide leaving
 * drops to the back halfway. It ships no appearance, so the slides here show
 * only their background: the slide on top is the one shown, and Next cuts
 * halfway to the next. The look and the throw are the consumer's CSS, as the
 * card stack recipe shows. Only the slide on top can be reached; the others
 * are inert.
 */
export const Stack: Story = {
  decorators: [
    (Story) => (
      <>
        <style>{`
          .cards .slide {
            display: grid;
            place-content: center;
            min-height: 240px;
            background: #eef;
          }
          .cards .slide:nth-child(even) { background: #fee; }
        `}</style>
        <div className="cards">
          <Story />
        </div>
      </>
    )
  ],
  render: (args) => (
    <Deck.Root {...args}>
      <Deck.Viewport className="viewport" effect={stack}>
        {slidesOf(4)}
      </Deck.Viewport>
      <Deck.Prev />
      <Deck.Next />
      <Deck.Dots />
    </Deck.Root>
  )
};

// One card per curve slide, filling it: the curve turns a slide's content.
const cards = Array.from({ length: 6 }, (_, i) => (
  <Deck.Slide key={i} className="slide">
    <div className="card">
      <p>Slide {i + 1}</p>
      <button type="button">Action {i + 1}</button>
    </div>
  </Deck.Slide>
));

/**
 * A showcase that fans out. `effect={curve}`, imported from
 * `@carouseldeck/react/curve`, turns each slide's content about its centre and
 * drops it onto a circle under the focal slide, fading the slide with
 * distance, as the viewport scrolls, snaps and drags natively. The slides
 * stay in place: here they snap at their centre, set in CSS. Each slide
 * holds one card that fills it, as the slide's own background would not
 * turn. The circle's radius, in slides, is `--deck-curve-radius` (4 by
 * default): here 3, set in CSS. The viewport clips the arc across the axis,
 * so it never shows a scrollbar; its bottom padding gives the arc room.
 * Under reduced motion the cards stay flat and the slides only fade. A deck
 * that does not import the effect ships none of its code.
 */
export const Curve: Story = {
  decorators: [
    (Story) => (
      <>
        <style>{`
          .showcase .viewport {
            --deck-curve-radius: 3;
            box-sizing: border-box;
            gap: 16px;
            padding: 16px calc(50% - 90px) 96px;
          }
          .showcase .slide {
            width: 180px;
            scroll-snap-align: center;
          }
          .showcase .card {
            display: grid;
            place-content: center;
            min-height: 220px;
            border-radius: 12px;
            background: #eef;
          }
          .showcase .slide:nth-child(even) .card { background: #fee; }
        `}</style>
        <div className="showcase">
          <Story />
        </div>
      </>
    )
  ],
  render: (args) => (
    <Deck.Root {...args}>
      <Deck.Viewport className="viewport" effect={curve}>
        {cards}
      </Deck.Viewport>
      <Deck.Prev />
      <Deck.Next />
      <Deck.Dots />
    </Deck.Root>
  )
};

/**
 * A hero that rotates on its own: `autoplay={3000}` moves the deck one snap
 * point on every three seconds, counted from when it comes to rest, and
 * stops at the last. `Deck.AutoplayToggle` stops and starts it (WCAG 2.2.2);
 * it comes first, ahead of the slides, so keyboard users reach it before the
 * moving content. A pointer over the deck or a hidden tab pauses it; focus
 * entering the deck, other than on the toggle, or a swipe, drag or wheel
 * scroll stops it until the toggle starts it again, and under reduced motion
 * it starts stopped. Changes the
 * user makes are announced politely; autoplay's are not.
 */
export const Autoplay: Story = {
  args: { autoplay: 3000 },
  render: (args) => (
    <Deck.Root {...args}>
      <Deck.AutoplayToggle />
      <Deck.Viewport className="viewport">{slides}</Deck.Viewport>
      <Deck.Prev />
      <Deck.Next />
      <Deck.Dots />
    </Deck.Root>
  )
};

/**
 * The optional theme, `import '@carouseldeck/react/theme.css'`, styles the
 * controls; the slides stay the consumer's CSS. Each value it sets is a
 * `--deck-*` custom property, such as `--deck-accent`, to override from any
 * ancestor.
 */
export const Themed: Story = {
  args: { autoplay: 3000 },
  decorators: [
    (Story) => (
      <>
        <style>{theme}</style>
        <Story />
      </>
    )
  ],
  render: (args) => (
    <Deck.Root {...args}>
      <Deck.AutoplayToggle />
      <Deck.Viewport className="viewport">{slides}</Deck.Viewport>
      <Deck.Prev />
      <Deck.Next />
      <Deck.Dots />
      <Deck.Counter />
    </Deck.Root>
  )
};

/**
 * The README's recipe: a playdeck video in each slide, and only the focal
 * slide's plays, muted, from when the deck mounts; the rest pause. The deck
 * calls `onFocalChange` once a scroll settles on a new focal slide, and the
 * recipe plays and pauses through each player's handle. The slides are CSS,
 * 80% wide, so the next one peeks.
 */
export const PlaydeckVideo: Story = {
  render: () => (
    <div className="video-deck">
      <style>{`
        .video-deck [data-carouseldeck-viewport] { gap: 16px; }
        .video-deck [data-carouseldeck-slide] { width: 80%; }
      `}</style>
      <VideoDeck sources={[clip, clip, clip, clip]} />
    </div>
  )
};

/**
 * The recipe with `loop`, as a feed usually is: the focal slide's video plays
 * across the seam both ways. Each slide's content calls `Deck.useSlide()`: a
 * slide mounts once (ADR-0013) and registers its player by its own index, so
 * nothing re-mounts, reloads or clears another slide's player crossing the
 * seam. The story puts the recipe's player handles on
 * `window.playdeckPlayers` for the end-to-end tests.
 */
export const PlaydeckVideoLoop: Story = {
  render: () => (
    <div className="video-deck">
      <style>{`
        .video-deck [data-carouseldeck-viewport] { gap: 16px; }
        .video-deck [data-carouseldeck-slide] { width: 80%; }
      `}</style>
      <VideoDeck
        sources={[clip, clip, clip, clip]}
        loop
        // For the end-to-end tests: the recipe's player handles.
        ref={(players) => {
          (window as { playdeckPlayers?: typeof players }).playdeckPlayers =
            players;
        }}
      />
    </div>
  )
};
