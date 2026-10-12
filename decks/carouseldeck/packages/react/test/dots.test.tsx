import { useState, type ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import * as Deck from '@carouseldeck/react';
import {
  expectSettledTo,
  setReducedMotion,
  TestDeck,
  viewportOf,
  WIDTH
} from './fixtures';

type DeckProps = ComponentProps<typeof TestDeck>;

const renderDeck = (props: DeckProps = {}) => {
  const onIndexChange = vi.fn();
  render(
    <TestDeck
      onIndexChange={onIndexChange}
      controls={<Deck.Dots />}
      {...props}
    />
  );
  const root = screen.getByRole('region', { name: 'Test deck' });
  const group = within(root).getByRole('group', { name: 'Choose page' });
  return {
    root,
    viewport: viewportOf(root),
    group,
    dots: () => within(group).getAllByRole('button'),
    onIndexChange
  };
};

const currentDots = (dots: HTMLElement[]) =>
  dots.flatMap((dot, i) =>
    dot.getAttribute('aria-current') === 'true' ? [i] : []
  );

let removeStyle = () => {};
afterEach(() => removeStyle());

describe('Dots', () => {
  test('one dot per snap point, not per slide', () => {
    // 2.5 slides in view: 5 slides rest at 4 snap points, the last being
    // the end of the scroll range.
    const style = document.createElement('style');
    style.textContent = `.peek > * { width: calc(100% / 2.5); }`;
    document.head.append(style);
    removeStyle = () => style.remove();

    const { dots } = renderDeck({ viewportClassName: 'peek' });

    expect(dots()).toHaveLength(4);
  });

  test('clicking a dot moves to its snap point and marks it current', async () => {
    const { viewport, dots, onIndexChange } = renderDeck();
    expect(currentDots(dots())).toEqual([0]);

    await userEvent.click(dots()[2]);

    await expectSettledTo(() => viewport.scrollLeft, 2 * WIDTH);
    expect(currentDots(dots())).toEqual([2]);
    expect(onIndexChange.mock.calls).toEqual([[2]]);
  });

  test('a dot follows a move made by other means', async () => {
    const { viewport, dots } = renderDeck();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    await expectSettledTo(() => viewport.scrollLeft, WIDTH);
    expect(currentDots(dots())).toEqual([1]);
  });

  test('in a controlled deck, a dot asks the parent, which decides', async () => {
    const onIndexChange = vi.fn();
    render(
      <TestDeck
        index={0}
        onIndexChange={onIndexChange}
        controls={<Deck.Dots />}
      />
    );
    const viewport = viewportOf(screen.getByRole('region'));

    await userEvent.click(screen.getByRole('button', { name: 'Go to page 3' }));

    // The parent never takes the new index, so the deck returns to it.
    await expect.poll(() => onIndexChange.mock.calls).toEqual([[2]]);
    await expectSettledTo(() => viewport.scrollLeft, 0);
  });

  test('a controlled parent that takes the index moves the dots', async () => {
    function Parent() {
      const [index, setIndex] = useState(0);
      return (
        <TestDeck
          index={index}
          onIndexChange={setIndex}
          controls={<Deck.Dots />}
        />
      );
    }
    render(<Parent />);
    const viewport = viewportOf(screen.getByRole('region'));

    await userEvent.click(screen.getByRole('button', { name: 'Go to page 4' }));

    await expectSettledTo(() => viewport.scrollLeft, 3 * WIDTH);
    expect(
      screen
        .getByRole('button', { name: 'Go to page 4' })
        .getAttribute('aria-current')
    ).toBe('true');
  });

  test('are absent when every slide fits', () => {
    render(<TestDeck slides={1} controls={<Deck.Dots />} />);

    expect(screen.queryByRole('group', { name: 'Choose page' })).toBeNull();
  });

  test('are absent with no slides, so no snap points', () => {
    render(<TestDeck slides={0} controls={<Deck.Dots />} />);

    expect(screen.queryByRole('group', { name: 'Choose page' })).toBeNull();
  });
});

describe('Dots with other moves', () => {
  afterEach(() => setReducedMotion(false));

  test('quick moves compose: Next steps on from a dot still in flight', async () => {
    const { viewport, dots, onIndexChange } = renderDeck();
    const next = screen.getByRole('button', { name: 'Next' });

    next.click();
    dots()[3].click();
    next.click();

    await expectSettledTo(() => viewport.scrollLeft, 4 * WIDTH);
    expect(currentDots(dots())).toEqual([4]);
    expect(onIndexChange.mock.calls).toEqual([[4]]);
  });

  test('with reduced motion, a dot jumps instead of scrolling smoothly', async () => {
    await setReducedMotion(true);
    const { viewport, dots } = renderDeck();

    dots()[3].click();

    expect(viewport.scrollLeft).toBe(3 * WIDTH);
  });
});

test('Dots outside a Root name the missing primitive', () => {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect(() => render(<Deck.Dots />)).toThrow(
      'Deck.Dots must be inside Deck.Root'
    );
  } finally {
    spy.mockRestore();
  }
});

describe('Dots accessibility', () => {
  test('a labelled group of buttons named for their page', () => {
    const { dots } = renderDeck();

    expect(dots().map((dot) => dot.getAttribute('aria-label'))).toEqual([
      'Go to page 1',
      'Go to page 2',
      'Go to page 3',
      'Go to page 4',
      'Go to page 5'
    ]);
    for (const dot of dots()) expect(dot.getAttribute('type')).toBe('button');
  });

  test('the group takes a label from the consumer', () => {
    render(<TestDeck controls={<Deck.Dots aria-label="Pick a photo" />} />);

    expect(screen.getByRole('group', { name: 'Pick a photo' })).toBeInstanceOf(
      HTMLDivElement
    );
  });

  test('a dot is reachable by keyboard and moves the deck', async () => {
    const { viewport, dots } = renderDeck();

    dots()[0].focus();
    await userEvent.keyboard('{Tab}');
    expect(document.activeElement).toBe(dots()[1]);
    await userEvent.keyboard('{Enter}');

    await expectSettledTo(() => viewport.scrollLeft, WIDTH);
  });
});

describe('Dots state as data attributes', () => {
  test('the group carries data-carouseldeck-dots, data-index and data-count', async () => {
    const { viewport, group, dots } = renderDeck();
    expect(group.getAttribute('data-carouseldeck-dots')).toBe('');
    expect(group.getAttribute('data-count')).toBe('5');
    expect(group.getAttribute('data-index')).toBe('0');

    await userEvent.click(dots()[3]);

    await expectSettledTo(() => viewport.scrollLeft, 3 * WIDTH);
    expect(group.getAttribute('data-index')).toBe('3');
  });

  test("a consumer's data attributes cannot overwrite the group's state", () => {
    const { group } = renderDeck({
      controls: (
        <Deck.Dots
          {...{
            'data-index': 'x',
            'data-count': 'y',
            'data-carouseldeck-dots': 'z'
          }}
        />
      )
    });

    expect(group.getAttribute('data-index')).toBe('0');
    expect(group.getAttribute('data-count')).toBe('5');
    expect(group.getAttribute('data-carouseldeck-dots')).toBe('');
  });

  // data-current marks the current slide (GLOSSARY.md); a dot is a page, and
  // the current one is styled with [aria-current].
  test('each dot carries data-index, and none data-current', () => {
    const { dots } = renderDeck();

    expect(dots().map((dot) => dot.getAttribute('data-index'))).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4'
    ]);
    expect(dots().some((dot) => dot.hasAttribute('data-current'))).toBe(false);
  });
});
