import * as Deck from '@carouseldeck/react';
import { curve } from '@carouseldeck/react/curve';
import { stack } from '@carouseldeck/react/stack';
import type { Meta, StoryObj } from '@storybook/react-vite';
// Each recipe's CSS is a file its docs page quotes byte for byte, inlined into
// its story's <style> so it applies to that story alone.
import cardStack from './card-stack.css?inline';
import cardStackFanned from './card-stack-fanned.css?inline';
import centredEnds from './centred-ends.css?inline';
import curveSize from './curve-size.css?inline';
import middleByProgress from './middle-by-progress.css?inline';
import middleCentred from './middle-centred.css?inline';
import responsiveDeck from './responsive-deck.css?inline';
import viewportBleed from './viewport-bleed.css?inline';
import { Products } from './custom-controls';
import { ResponsiveDeck } from './responsive-deck';

const slidesOf = (count: number) =>
  Array.from({ length: count }, (_, i) => (
    <Deck.Slide key={i}>
      <p>Slide {i + 1}</p>
      <button type="button">Action {i + 1}</button>
    </Deck.Slide>
  ));

// The look, apart from each recipe's CSS.
const look = `
  [data-carouseldeck-slide] { background: #eef; }
  [data-carouseldeck-slide]:nth-child(even) { background: #fee; }
`;

/** A deck of six slides with the recipe's CSS, classed `products`. */
const productsWith = (css: string) => () => (
  <>
    <style>{look + css}</style>
    <Deck.Root aria-label="Featured slides" className="products">
      <Deck.Viewport>{slidesOf(6)}</Deck.Viewport>
      <Deck.Prev />
      <Deck.Next />
      <Deck.Dots />
    </Deck.Root>
  </>
);

const meta = { title: 'Recipes' } satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The README's recipe "centre the first and last slide": with
 * `scroll-snap-align: center`, the viewport's inline padding, half the
 * viewport less half a slide, lets the first and last slides reach the
 * centre without `loop`.
 */
export const CentredEnds: Story = { render: productsWith(centredEnds) };

/**
 * The README's recipe "highlight the middle slide in view", centred: the
 * focal slide is the one at the snap alignment point, here the centre, so
 * `[data-focal]` styles the middle of the three slides in view.
 */
export const MiddleCentred: Story = { render: productsWith(middleCentred) };

/**
 * The same recipe with the slides at the start: the focal slide is the
 * first in view, so the middle one is styled by its progress, 1.
 */
export const MiddleByProgress: Story = {
  render: productsWith(middleByProgress)
};

/**
 * The docs recipe "let slides extend past the viewport": a page wide
 * enough to hold container query units, a narrower centred column, and a
 * viewport whose `--bleed-inset`, computed once from `cqi` and the
 * column's own width, bleeds it to the page while keeping snapping, the
 * index and the controls at the column.
 */
export const ViewportBleed: Story = {
  render: () => (
    <>
      <style>{`
        ${look}
        /* Slides narrower than the column: two and a half fit, so the
           third already pokes past the column's edge. The recipe's own
           bleed CSS below is what lets it keep going, to the page edge. */
        .column [data-carouseldeck-viewport] { gap: 16px; }
        .column [data-carouseldeck-slide] {
          width: calc((100% - 2 * 16px) / 2.5);
          scroll-snap-align: start;
        }
        ${viewportBleed}
      `}</style>
      <div className="page">
        <div className="column">
          <Deck.Root aria-label="Featured slides">
            <Deck.Viewport>{slidesOf(6)}</Deck.Viewport>
            <Deck.Prev />
            <Deck.Next />
            <Deck.Dots />
          </Deck.Root>
        </div>
      </div>
    </>
  )
};

/**
 * The README's recipe "size a curve": a radius of 528px under 160px slides,
 * 16px apart, is 3 slides, and the viewport's block padding leaves the arc
 * room, so no slide that is not faded out is clipped, at rest or mid-move.
 */
export const CurveSize: Story = {
  render: () => (
    <>
      <style>{`
        .showcase .card {
          display: grid;
          place-content: center;
          border-radius: 12px;
          background: #eef;
        }
        .showcase [data-carouseldeck-slide]:nth-child(even) .card {
          background: #fee;
        }
        ${curveSize}
      `}</style>
      <Deck.Root aria-label="Featured slides" className="showcase">
        <Deck.Viewport effect={curve}>
          {Array.from({ length: 6 }, (_, i) => (
            <Deck.Slide key={i}>
              <div className="card">
                <p>Slide {i + 1}</p>
                <button type="button">Action {i + 1}</button>
              </div>
            </Deck.Slide>
          ))}
        </Deck.Viewport>
        <Deck.Prev />
        <Deck.Next />
        <Deck.Dots />
      </Deck.Root>
    </>
  )
};

const cards = [
  { title: 'Draft', text: 'Write it down before it slips away.' },
  { title: 'Review', text: 'Read it again tomorrow, with fresh eyes.' },
  { title: 'Ship', text: 'Send it out, then start the next one.' }
];

// The cards' text, in both card stack stories; the recipe's CSS draws the
// cards themselves.
const cardText = `
  .cards { font-family: system-ui, sans-serif; color: #222; }
  .cards .card { display: grid; gap: 8px; }
  .cards .card h3 { margin: 0; font-size: 1.05rem; }
  .cards .card p { margin: 0; line-height: 1.5; }
  .cards .card button { justify-self: start; }
`;

function Cards() {
  return (
    <Deck.Root aria-label="Featured slides" className="cards" loop>
      <Deck.Viewport effect={stack}>
        {cards.map((card) => (
          <Deck.Slide key={card.title}>
            <div className="card">
              <h3>{card.title}</h3>
              <p>{card.text}</p>
              <Deck.Next>Next</Deck.Next>
            </div>
          </Deck.Slide>
        ))}
      </Deck.Viewport>
    </Deck.Root>
  );
}

/**
 * The recipe "a card stack": `effect={stack}` orders the cards, and the
 * recipe's CSS draws them on `--deck-slide-progress`. The cards behind the
 * top one are smaller and dimmer by depth, and peek out above it. Next, in
 * the card, throws the top card out toward the inline start, clear of the
 * stack, then back in behind it, at the back. Under reduced motion it cuts
 * to the next card instead.
 */
export const CardStack: Story = {
  render: () => (
    <>
      <style>{`${cardText}${cardStack}`}</style>
      <Cards />
    </>
  )
};

/**
 * The same cards and recipe with another look: the recipe's fanned pile.
 * Behind the top card, each card shifts and turns by its depth. Only the CSS
 * changes: `card-stack-fanned.css` after the recipe's.
 */
export const CardStackFanned: Story = {
  render: () => (
    <>
      <style>{`${cardText}${cardStack}${cardStackFanned}`}</style>
      <Cards />
    </>
  )
};

/**
 * The README's recipe "custom controls and a counter": Previous, Next, a
 * button per page and a counter, from a design system's button, built on
 * `Deck.useDeck()`.
 */
export const CustomControls: Story = {
  render: () => (
    <>
      <style>{`
        ${look}
        .controls { display: flex; gap: 8px; align-items: center; }
        .controls [role=group] { display: flex; gap: 4px; }
        .ds-button { padding: 4px 12px; border: 1px solid #335; border-radius: 4px; background: #fff; color: #335; }
        .ds-button[aria-current] { background: #335; color: #fff; }
      `}</style>
      <Products />
    </>
  )
};

/**
 * The README's recipe "change `effect`, `loop` or `autoplay` per
 * breakpoint": a `useMediaQuery` hook picks the props. Below 768px the deck
 * crossfades one slide at a time; from 768px it shows three slides and
 * loops. Resizing the window across 768px keeps the deck on its slide.
 */
export const PerBreakpoint: Story = {
  render: () => (
    <>
      <style>{look + responsiveDeck}</style>
      <ResponsiveDeck>{slidesOf(6)}</ResponsiveDeck>
    </>
  )
};
