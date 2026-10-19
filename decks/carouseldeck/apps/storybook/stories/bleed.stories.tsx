import * as Deck from '@carouseldeck/react';
import { curve } from '@carouseldeck/react/curve';
import { fade } from '@carouseldeck/react/fade';
import { stack } from '@carouseldeck/react/stack';
import type { Meta, StoryObj } from '@storybook/react-vite';

// #188: can a deck's viewport bleed past a centred column, in CSS alone? A
// full-width page holds a narrower centred column (here a literal 400px, so
// the inset below has no percentage in it); the viewport's own CSS reads
// the gap between them from container query units on the page (`cqi`),
// with no JavaScript measurement:
//
//   --inset: calc((100cqi - 400px) / 2)
//   margin-inline: calc(-1 * var(--inset))   -- pull the viewport to the page
//   padding-inline: var(--inset)             -- put the slides back
//   scroll-padding-inline: var(--inset)      -- snap against the column
//
// `--inset` is computed once, from `cqi` and a literal length alone, and
// read the same way by all three properties. Written instead as
// `calc((100cqi - 100%) / 2)` on the viewport directly, each property
// would compute a different pixel value for the same declaration:
// `padding-inline`'s `%` resolves against the viewport's containing block
// (the column), but `scroll-padding-inline`'s resolves against the
// viewport's own scrollport (the bled width, CSS Scroll Snap sec. 6), so the
// two go out of sync, and the deck scrolls to hide the padding on mount
// instead of resting on the column (`docs/research/viewport-bleed.md`,
// question 1). `.page` needs `container-type: inline-size` for `cqi` to
// read its own width; `.column` is a plain centred block. Every story here
// renders the same two levels, so the deck inside sits in the column while
// its neighbours bleed out to the page edge.
const css = `
  .page { width: 100%; container-type: inline-size; }
  .column { width: 400px; margin-inline: auto; }
  .column .viewport {
    --inset: calc((100cqi - 400px) / 2);
    margin-inline: calc(-1 * var(--inset));
    padding-inline: var(--inset);
    scroll-padding-inline: var(--inset);
  }
  .slide {
    width: calc((100% - 2 * 16px) / 2.5);
    scroll-snap-align: start;
    background: #eef;
  }
  .slide:nth-child(even) { background: #fee; }
  .viewport { gap: 16px; }
  .card {
    display: grid;
    place-content: center;
    min-height: 100%;
    background: #eef;
  }
  .slide:nth-child(even) .card { background: #fee; }
  /* Curve's own recipe: one slide centred at a time, wide enough for its
     card, as \`deck.stories.tsx\`'s own Curve story sets it. The peek
     width above, several slides per view, left the focal slide's own
     progress unsettled under the bleed padding -- centred, single-slide
     alignment is what question 3 in the research doc answers against. */
  .curve-slide {
    width: 180px;
    scroll-snap-align: center;
  }
`;

const slidesOf = (count: number) =>
  Array.from({ length: count }, (_, i) => (
    <Deck.Slide key={i} className="slide">
      <p>Slide {i + 1}</p>
      <button type="button">Action {i + 1}</button>
    </Deck.Slide>
  ));

// Curve turns a slide's content, not its own box (ADR-0008): give it one
// child that fills the slide, styled as the slide is seen, as
// `deck.stories.tsx`'s own Curve story does. Reusing `slidesOf`'s bare
// `<p>` and `<button>` leaves them over the page's own background once
// turned, not the slide's -- axe then reads the button's default low
// contrast there, nothing to do with the bleed.
const cardsOf = (count: number) =>
  Array.from({ length: count }, (_, i) => (
    <Deck.Slide key={i} className="slide curve-slide">
      <div className="card">
        <p>Slide {i + 1}</p>
        <button type="button">Action {i + 1}</button>
      </div>
    </Deck.Slide>
  ));

const meta = {
  title: 'Bleed',
  component: Deck.Root,
  args: { 'aria-label': 'Featured slides', defaultIndex: 0 }
} satisfies Meta<typeof Deck.Root>;

export default meta;

type Story = StoryObj<typeof meta>;

// The bleed page/column, as a decorator every story here uses. Meta-level
// decorators defeat `satisfies Meta<typeof Deck.Root>`'s inference of
// `args` (every story's `args` types as `never`), so each story below
// applies it itself, as `deck.stories.tsx`'s own per-story decorators do.
const bleedPage: Story['decorators'] = [
  (Story) => (
    <>
      <style>{css}</style>
      <div className="page">
        <div className="column">
          <Story />
        </div>
      </div>
    </>
  )
];

/**
 * A plain deck, bled past its column in CSS alone (above). Snapping (Next,
 * Dots, the arrow keys, a drag) still aligns to the column, not the page:
 * `scroll-padding-inline` excludes the padding that restores the slides'
 * position, so the browser's own snap search never lands inside it.
 */
export const Plain: Story = {
  decorators: bleedPage,
  render: (args) => (
    <Deck.Root {...args}>
      <Deck.Viewport className="viewport">{slidesOf(6)}</Deck.Viewport>
      <Deck.Prev />
      <Deck.Next />
      <Deck.Dots />
      <Deck.Counter />
    </Deck.Root>
  )
};

/**
 * Fade under the same bleed CSS. Fade stacks the slides with
 * `position: sticky` over empty snap targets (ADR-0007); the sticky slide's
 * `inset-inline-start: 0` is resolved against the viewport's own padding
 * box, which already includes `padding-inline-start`, so the slide sticks at
 * the column's edge, not the page's.
 */
export const Fade: Story = {
  decorators: bleedPage,
  render: (args) => (
    <Deck.Root {...args}>
      <Deck.Viewport className="viewport" effect={fade}>
        {slidesOf(6)}
      </Deck.Viewport>
      <Deck.Prev />
      <Deck.Next />
      <Deck.Dots />
    </Deck.Root>
  )
};

/** Stack under the same bleed CSS: the same sticky layout as Fade. */
export const Stack: Story = {
  decorators: bleedPage,
  render: (args) => (
    <Deck.Root {...args}>
      <Deck.Viewport className="viewport" effect={stack}>
        {slidesOf(6)}
      </Deck.Viewport>
      <Deck.Prev />
      <Deck.Next />
      <Deck.Dots />
    </Deck.Root>
  )
};

/**
 * Curve under the same bleed CSS. Curve draws on the slides' own content and
 * sets no geometry inline but `contain: layout` (ADR-0008), so it is
 * unaffected by the viewport's padding: the slides snap and the arc draws
 * exactly as in the plain Curve story, only shifted into the column.
 */
export const Curve: Story = {
  decorators: bleedPage,
  render: (args) => (
    <Deck.Root {...args}>
      <Deck.Viewport className="viewport" effect={curve}>
        {cardsOf(6)}
      </Deck.Viewport>
      <Deck.Prev />
      <Deck.Next />
      <Deck.Dots />
    </Deck.Root>
  )
};

/**
 * A looping deck under the same bleed CSS, with a run too short for shells
 * (ADR-0013): it falls back to full copies. This story is a known crash
 * (React's "Maximum update depth exceeded"), not a passing demo: once the
 * bled viewport -- wider than the column -- is about as wide as the
 * slides' whole run, `DeckEngine`'s own loop-or-not and shells-or-copies
 * checks read that full bled width, so they can thrash between two
 * readings on every settle. No test opens it; see
 * `docs/research/viewport-bleed.md`, question 4, and widen the column or
 * add slides to see it render.
 */
export const Loop: Story = {
  decorators: bleedPage,
  args: { loop: true },
  render: (args) => (
    <Deck.Root {...args}>
      <Deck.Viewport className="viewport">{slidesOf(6)}</Deck.Viewport>
      <Deck.Prev />
      <Deck.Next />
      <Deck.Dots />
    </Deck.Root>
  )
};

/**
 * A looping deck with a run long enough for shells (ADR-0013): the real
 * slides translate onto empty, measured shells, positioned and sized from
 * the real slides' own boxes, which already sit in the column, so the
 * shells inherit the bleed with no change of their own.
 */
export const LoopShells: Story = {
  decorators: bleedPage,
  args: { loop: true },
  render: (args) => (
    <Deck.Root {...args}>
      <Deck.Viewport className="viewport">{slidesOf(12)}</Deck.Viewport>
      <Deck.Prev />
      <Deck.Next />
      <Deck.Dots />
    </Deck.Root>
  )
};
