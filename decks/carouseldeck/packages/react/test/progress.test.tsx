import { Profiler, type ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import * as Deck from '@carouseldeck/react';
import {
  addStyle,
  CENTRED,
  expectSettledTo,
  mouseDrag,
  progressOf,
  serverThenHydrated,
  viewportOf,
  WIDTH
} from './fixtures';

// Progress (GLOSSARY.md): each slide's signed distance from the focal
// position, in slides, written to the DOM as `--deck-slide-progress`, never
// React state (ADR-0003). In-view: `data-in-view` on each slide the viewport
// shows.

const HEIGHT = 200;

type ProgressDeckProps = ComponentProps<typeof Deck.Root> & {
  slides?: number;
  viewportClassName?: string;
  dir?: 'ltr' | 'rtl';
};

function ProgressDeck({
  slides = 5,
  viewportClassName,
  dir = 'ltr',
  orientation,
  ...props
}: ProgressDeckProps) {
  return (
    <div dir={dir}>
      <Deck.Root aria-label="Test deck" orientation={orientation} {...props}>
        <Deck.Viewport
          className={viewportClassName}
          style={{
            width: WIDTH,
            height: orientation === 'vertical' ? HEIGHT : 100
          }}
        >
          {Array.from({ length: slides }, (_, i) => (
            <Deck.Slide key={i}>Slide {i + 1}</Deck.Slide>
          ))}
        </Deck.Viewport>
        <Deck.Next />
      </Deck.Root>
    </div>
  );
}

const renderDeck = (props: ProgressDeckProps = {}) => {
  const onRender = vi.fn();
  render(
    <Profiler id="deck" onRender={onRender}>
      <ProgressDeck {...props} />
    </Profiler>
  );
  const root = screen.getByRole('region', { name: 'Test deck' });
  const viewport = viewportOf(root);
  const slides = () => [...viewport.children] as HTMLElement[];
  return {
    root,
    viewport,
    onRender,
    next: screen.getByRole('button', { name: 'Next' }),
    progress: () => progressOf(viewport),
    inView: () =>
      slides().flatMap((slide, i) =>
        slide.hasAttribute('data-in-view') ? [i] : []
      )
  };
};

const closeTo = (values: number[]) =>
  values.map((value) => expect.closeTo(value, 2));

// With `CENTRED`, three and a half slides in view: at scroll 0 the centre
// falls a quarter of a slide past slide 1's centre.

describe('--deck-slide-progress', () => {
  test('is each slide’s distance from the focal slide, in slides, before the first paint', () => {
    const { progress } = renderDeck();

    expect(progress()).toEqual([0, 1, 2, 3, 4]);
  });

  test('follows the deck to a new snap point', async () => {
    const { next, progress } = renderDeck();

    await userEvent.click(next);

    await expectSettledTo(progress, [-1, 0, 1, 2, 3]);
  });

  test('counts in slides, not pixels, with a gap between them', async () => {
    addStyle(`.gapped { gap: 20px; } .gapped > * { width: 100px; }`);
    const { next, progress } = renderDeck({ viewportClassName: 'gapped' });

    await userEvent.click(next);

    await expectSettledTo(progress, [-1, 0, 1, 2, 3]);
  });

  test('is measured from the snap alignment point', () => {
    addStyle(CENTRED);
    const { progress } = renderDeck({
      slides: 7,
      viewportClassName: 'centred'
    });

    expect(progress()).toEqual(
      closeTo([-1.25, -0.25, 0.75, 1.75, 2.75, 3.75, 4.75])
    );
  });

  test('updates during a scroll with no React render', async () => {
    const { viewport, progress, onRender } = renderDeck();
    const renders = onRender.mock.calls.length;

    const letGo = await mouseDrag(viewport, -WIDTH / 2, {
      holdMs: 100,
      release: false
    });

    await expect.poll(progress).toEqual(closeTo([-0.5, 0.5, 1.5, 2.5, 3.5]));
    expect(onRender).toHaveBeenCalledTimes(renders);
    await letGo();
  });

  test('runs the same way in a vertical deck', async () => {
    const { viewport, next, progress } = renderDeck({
      orientation: 'vertical'
    });

    await userEvent.click(next);
    await expectSettledTo(progress, [-1, 0, 1, 2, 3]);

    const letGo = await mouseDrag(viewport, -HEIGHT / 2, {
      axis: 'y',
      holdMs: 100,
      release: false
    });
    await expect.poll(progress).toEqual(closeTo([-1.5, -0.5, 0.5, 1.5, 2.5]));
    await letGo();
  });

  test('runs the same way in a right-to-left deck', async () => {
    const { viewport, next, progress } = renderDeck({ dir: 'rtl' });

    await userEvent.click(next);
    await expectSettledTo(progress, [-1, 0, 1, 2, 3]);

    // In right-to-left, a pointer moving right drags the deck forward.
    const letGo = await mouseDrag(viewport, WIDTH / 2, {
      holdMs: 100,
      release: false
    });
    await expect.poll(progress).toEqual(closeTo([-1.5, -0.5, 0.5, 1.5, 2.5]));
    await letGo();
  });
});

// Server HTML gives every deck's slides their starting progress, effect or
// not, so consumer CSS on progress, as a scale by distance, paints as it will
// once hydrated (#125).
describe('--deck-slide-progress in server HTML', () => {
  // Three slides in view, at their start, each scaled by its distance from
  // the focal slide, as the docs' progress example does.
  const SCALED = `.scaled > * {
    width: ${WIDTH / 3}px;
    scale: calc(1 - min(max(var(--deck-slide-progress, 0), -1 * var(--deck-slide-progress, 0)), 1) * 0.2);
  }`;
  const painted = (viewport: HTMLElement) =>
    [...viewport.children].map((slide) => getComputedStyle(slide).scale);

  test.each<{ name: string; props: ProgressDeckProps; progress: number[] }>([
    {
      name: 'at defaultIndex 2',
      props: { defaultIndex: 2 },
      progress: [-2, -1, 0, 1, 2]
    },
    {
      name: 'at a controlled index 1',
      props: { index: 1, onIndexChange: () => {} },
      progress: [-1, 0, 1, 2, 3]
    },
    {
      name: 'looping, at defaultIndex 1',
      props: { loop: true, defaultIndex: 1 },
      progress: [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, -6, -5, -4, -3, -2]
    }
  ])(
    'with no effect, gives each slide its progress and hydrates without changing it, $name',
    async ({ props, progress }) => {
      addStyle(SCALED);
      const { viewport, server, serverProgress, hydrated } =
        await serverThenHydrated(
          <ProgressDeck viewportClassName="scaled" {...props} />,
          painted
        );

      expect(serverProgress).toEqual(progress);
      expect(progressOf(viewport)).toEqual(serverProgress);
      expect(hydrated).toEqual(server);
    }
  );
});

describe('--deck-slide-index', () => {
  test('is each slide’s index, in the server HTML', () => {
    const html = renderToString(<ProgressDeck slides={3} />);
    const container = document.createElement('div');
    container.innerHTML = html;

    expect(
      [...viewportOf(container).children].map((slide) =>
        (slide as HTMLElement).style.getPropertyValue('--deck-slide-index')
      )
    ).toEqual(['0', '1', '2']);
  });

  test('sits alongside the consumer’s style', () => {
    render(
      <Deck.Root aria-label="Test deck">
        <Deck.Viewport>
          <Deck.Slide style={{ color: 'red' }}>Slide 1</Deck.Slide>
        </Deck.Viewport>
      </Deck.Root>
    );
    const slide = screen.getByRole('group', { name: '1 of 1' });

    expect(slide.style.getPropertyValue('--deck-slide-index')).toBe('0');
    expect(slide.style.color).toBe('red');
  });
});

describe('--deck-slide-count', () => {
  test('is the number of slides, on each slide and copy, in the server HTML', () => {
    const html = renderToString(<ProgressDeck slides={3} loop />);
    const container = document.createElement('div');
    container.innerHTML = html;
    const slides = [...viewportOf(container).children] as HTMLElement[];

    // Copies are not counted.
    expect(
      slides.filter((slide) => slide.hasAttribute('data-carouseldeck-copy'))
    ).toHaveLength(6);
    expect(
      slides.map((slide) => slide.style.getPropertyValue('--deck-slide-count'))
    ).toEqual(Array(9).fill('3'));
  });
});

describe('data-in-view', () => {
  test('marks only the slide in view at rest, before the first paint', () => {
    const { inView } = renderDeck();

    expect(inView()).toEqual([0]);
  });

  test('marks every slide partly in view', () => {
    addStyle(CENTRED);
    const { inView } = renderDeck({ slides: 7, viewportClassName: 'centred' });

    // Slide 3 spans 257px to 343px of the 300px viewport.
    expect(inView()).toEqual([0, 1, 2, 3]);
  });

  test('follows a scroll, with no React render', async () => {
    const { viewport, inView, onRender } = renderDeck();
    const renders = onRender.mock.calls.length;

    const letGo = await mouseDrag(viewport, -WIDTH * 0.6, {
      holdMs: 100,
      release: false
    });

    await expect.poll(inView).toEqual([0, 1]);
    expect(onRender).toHaveBeenCalledTimes(renders);
    await letGo();
    await expectSettledTo(inView, [1]);
  });

  test('follows a vertical deck', async () => {
    const { next, inView } = renderDeck({ orientation: 'vertical' });

    await userEvent.click(next);

    await expectSettledTo(inView, [1]);
  });

  test('follows a right-to-left deck', async () => {
    const { next, inView } = renderDeck({ dir: 'rtl' });

    await userEvent.click(next);

    await expectSettledTo(inView, [1]);
  });

  test('follows a resize of the viewport', async () => {
    addStyle(`.narrow > * { width: 150px; }`);
    const { viewport, inView } = renderDeck({ viewportClassName: 'narrow' });
    expect(inView()).toEqual([0, 1]);

    viewport.style.width = `${WIDTH + 150}px`;

    await expect.poll(inView).toEqual([0, 1, 2]);
  });
});
