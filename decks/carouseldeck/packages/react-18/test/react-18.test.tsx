// What only the React 18 build does: the React package's tests cover the
// rest, run on React 18 by vitest.react-18.config.ts.
import { createRef, version } from 'react';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import * as Deck from '@carouseldeck/react';
import { fade } from '@carouseldeck/react/fade';

test('runs on React 18', () => {
  expect(version).toMatch(/^18\./);
});

// Viewport aside: a consumer's ref there replaces the deck's own, on React 19
// too, a bug of the source this build does not change.
test('a ref reaches the element of every primitive but Viewport', () => {
  const refs = {
    root: createRef<HTMLDivElement>(),
    slide: createRef<HTMLDivElement>(),
    prev: createRef<HTMLButtonElement>(),
    next: createRef<HTMLButtonElement>(),
    dots: createRef<HTMLDivElement>(),
    counter: createRef<HTMLSpanElement>(),
    toggle: createRef<HTMLButtonElement>()
  };
  render(
    <Deck.Root ref={refs.root} aria-label="Slides" autoplay={5000}>
      <Deck.AutoplayToggle ref={refs.toggle} />
      <Deck.Viewport style={{ width: 300 }}>
        <Deck.Slide ref={refs.slide}>One</Deck.Slide>
        <Deck.Slide>Two</Deck.Slide>
      </Deck.Viewport>
      <Deck.Prev ref={refs.prev} />
      <Deck.Next ref={refs.next} />
      <Deck.Dots ref={refs.dots} />
      <Deck.Counter ref={refs.counter} />
    </Deck.Root>
  );

  expect(refs.root.current).toBe(screen.getByRole('region'));
  expect(refs.slide.current).toHaveAccessibleName('1 of 2');
  expect(refs.prev.current).toHaveAttribute('data-carouseldeck-prev');
  expect(refs.next.current).toHaveAttribute('data-carouseldeck-next');
  expect(refs.dots.current).toHaveAttribute('data-carouseldeck-dots');
  expect(refs.counter.current).toHaveAttribute('data-carouseldeck-counter');
  expect(refs.toggle.current).toHaveAttribute(
    'data-carouseldeck-autoplay-toggle'
  );
});

test('server HTML holds the styles before the viewport, unescaped, and React 18 warns of nothing', () => {
  const error = vi.spyOn(console, 'error');
  const html = renderToString(
    <Deck.Root aria-label="Slides" loop>
      <Deck.Viewport effect={fade}>
        <Deck.Slide>One</Deck.Slide>
        <Deck.Slide>Two</Deck.Slide>
      </Deck.Viewport>
    </Deck.Root>
  );
  const container = document.createElement('div');
  container.innerHTML = html;
  const viewport = container.querySelector('[data-carouseldeck-viewport]')!;

  expect(viewport.querySelector('style')).toBeNull();
  const styles = [...container.querySelectorAll('style')];
  expect(styles).toHaveLength(2);
  expect(styles[1]!.nextElementSibling).toBe(viewport);
  expect(styles[0]!.textContent).toContain('[data-orientation=vertical]>');
  expect(html).not.toMatch(/precedence|inert="true"/);
  // Only the layout-effect warning a server render in a browser prints: on
  // the server, where there is no window, the build uses useEffect instead.
  const warnings = error.mock.calls
    .map(([message]) => String(message))
    .filter((message) => !message.includes('useLayoutEffect does nothing'));
  expect(warnings).toEqual([]);
});

// Two full-width slides is the boundary (ADR-0013): a set no shorter than
// the viewport plus its widest slide keeps shells.
test('a loop shell is inert', () => {
  render(
    <Deck.Root aria-label="Slides" loop>
      <Deck.Viewport style={{ width: 300 }}>
        <Deck.Slide>One</Deck.Slide>
        <Deck.Slide>Two</Deck.Slide>
      </Deck.Viewport>
    </Deck.Root>
  );
  const shells = document.querySelectorAll('[data-carouseldeck-shell]');

  expect(shells.length).toBeGreaterThan(0);
  for (const shell of shells) expect(shell).toHaveAttribute('inert', '');
  for (const slide of document.querySelectorAll('[data-carouseldeck-slide]')) {
    expect(slide).not.toHaveAttribute('inert');
  }
});

test('a consumer’s inert="", as React 18 writes it, stays inert', () => {
  render(
    <Deck.Root aria-label="Slides">
      <Deck.Viewport style={{ width: 300 }}>
        <Deck.Slide {...{ inert: '' }}>One</Deck.Slide>
        <Deck.Slide>Two</Deck.Slide>
      </Deck.Viewport>
    </Deck.Root>
  );

  expect(screen.getByText('One')).toHaveAttribute('inert', '');
  expect(screen.getByText('Two')).not.toHaveAttribute('inert');
});

test('an effect’s CSS cannot end its style element', () => {
  const effect = { name: 'escape', css: '</style><b id="out"></b>' };
  const container = document.createElement('div');
  container.innerHTML = renderToString(
    <Deck.Root aria-label="Slides">
      <Deck.Viewport effect={effect}>
        <Deck.Slide>One</Deck.Slide>
      </Deck.Viewport>
    </Deck.Root>
  );

  expect(container.querySelector('#out')).toBeNull();
});
