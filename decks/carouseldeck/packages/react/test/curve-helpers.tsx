import type { ComponentProps, CSSProperties } from 'react';
import { render, screen } from '@testing-library/react';
import * as Deck from '@carouseldeck/react';
import { curve } from '@carouseldeck/react/curve';
import { addStyle, progressOf, viewportOf } from './fixtures';

// Shared by curve.test.tsx and curve-paint-and-fade.test.tsx, one file
// until #179's paint-order and fade tests were split out so they could also
// run in WebKit (vitest.config.ts).

/** Each slide's size, square, and so the distance between two slides. */
export const SIZE = 100;
/** Three slides in view, the focal one in the middle. */
export const SPAN = SIZE * 3;

export type CurveDeckProps = ComponentProps<typeof Deck.Root> & {
  slides?: number;
  dir?: 'ltr' | 'rtl';
  viewportStyle?: CSSProperties;
};

export function CurveDeck({
  slides = 6,
  dir = 'ltr',
  orientation,
  viewportStyle,
  ...props
}: CurveDeckProps) {
  const vertical = orientation === 'vertical';
  return (
    <div dir={dir}>
      <Deck.Root aria-label="Test deck" orientation={orientation} {...props}>
        <Deck.Viewport
          effect={curve}
          className="curved"
          style={{
            boxSizing: 'border-box',
            // Room for the first and last slides to reach the middle.
            ...(vertical
              ? { width: SIZE, height: SPAN, paddingBlock: SIZE }
              : { width: SPAN, paddingInline: SIZE }),
            ...viewportStyle
          }}
        >
          {Array.from({ length: slides }, (_, i) => (
            <Deck.Slide key={i}>
              <div className="card">
                <button type="button">Button {i + 1}</button>
              </div>
            </Deck.Slide>
          ))}
        </Deck.Viewport>
        <Deck.Next />
      </Deck.Root>
    </div>
  );
}

// Centred, so the focal slide is in the middle of the arc: alignment is the
// consumer's.
export const SLIDE_CSS = `.curved > [data-carouseldeck-slide] {
  width: ${SIZE}px;
  height: ${SIZE}px;
  box-sizing: border-box;
  scroll-snap-align: center;
}
.card { height: 100%; }`;

export const round = (value: number) => Math.round(value * 10) / 10 || 0;

export const readDeck = (root: HTMLElement) => {
  const viewport = viewportOf(root);
  const slides = () => [
    ...viewport.querySelectorAll<HTMLElement>('[data-carouseldeck-slide]')
  ];
  // The curve draws each slide's content, the card that fills it.
  const matrices = () =>
    slides().map(
      (slide) =>
        new DOMMatrix(getComputedStyle(slide.firstElementChild!).transform)
    );
  return {
    root,
    viewport,
    slides,
    /** Each slide's rotation, in degrees, clockwise. */
    angles: () =>
      matrices().map((m) => round((Math.atan2(m.b, m.a) * 180) / Math.PI)),
    /** How far each slide's centre has moved, in px: across the axis, and
     * along it. Rotation is about the centre. */
    moved: () =>
      matrices().map((m) => [round(m.e), round(m.f)] as [number, number]),
    opacity: () =>
      slides().map(
        (slide) =>
          Math.round(Number(getComputedStyle(slide).opacity) * 100) / 100
      ),
    zIndex: () =>
      slides().map((slide) => Number(getComputedStyle(slide).zIndex)),
    progress: () => progressOf(viewport)
  };
};

/** Renders a curve deck, with `css` as more consumer CSS for its slides. */
export const renderDeck = (props: CurveDeckProps = {}, css = '') => {
  addStyle(SLIDE_CSS + css);
  render(<CurveDeck {...props} />);
  const root = screen.getByRole('region', { name: 'Test deck' });
  return {
    ...readDeck(root),
    get next() {
      return screen.getByRole('button', { name: 'Next' });
    }
  };
};

/** Fully opaque at the focal position, 0.75 a slide away, …, 0 at the
 * default radius of 4. */
export const FADE = [1, 0.75, 0.5, 0.25, 0];
export const AROUND_2 = [-2, -1, 0, 1, 2, 3];
