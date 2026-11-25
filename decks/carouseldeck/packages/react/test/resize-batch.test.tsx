import { describe, expect, onTestFinished, test } from 'vitest';
import { render } from '@testing-library/react';
import { COPY, createDeck, type DeckState } from '@carouseldeck/core';
import { addStyle, CENTRED, TestDeck, viewportOf } from './fixtures';

// #339: every deck on a page used to own a `ResizeObserver`, so its first
// delivery ran the decks one after another, and each deck's writes (custom
// properties, scroll) dirtied style before the next deck read layout: about
// one forced style recalc per deck. One shared scheduler per document reads
// every deck, then writes every deck. This logs every layout read and every
// style or scroll write made inside a `ResizeObserver` callback, from the
// mount of 20 decks to the end of their first delivery, and checks no read
// follows a write.

const WIDTH = 100;
const DECKS = 20;
const SLIDES = 5;

type Event = { kind: 'read' | 'write'; deck: number };

/**
 * Logs every layout or style read and every style, scroll or attribute write
 * made inside a `ResizeObserver` callback, each with the deck (the index of
 * the viewport holding its target) it belongs to. A read of a computed
 * style's property counts, not only the `getComputedStyle()` call: the
 * declaration is live, and reading a property off it after a write forces a
 * recalc as surely as a rect does. A write through `el.style.x = ...`,
 * `style.cssText` or `scrollLeft = ...` counts as much as `setProperty`.
 */
function instrument(viewports: () => HTMLElement[]) {
  const events: Event[] = [];
  let inDelivery = 0;
  const owners = new WeakMap<object, Element>();
  const deckOf = (target: unknown) => {
    let el = target instanceof Element ? target : owners.get(target as object);
    if (!el && target) {
      for (const viewport of viewports()) {
        for (const each of [viewport, ...viewport.querySelectorAll('*')]) {
          if (each instanceof HTMLElement) owners.set(each.style, each);
        }
      }
      el = owners.get(target as object);
    }
    // The innermost viewport holding it, for a deck inside another.
    return viewports().reduce(
      (found, viewport, i) => (!!el && viewport.contains(el) ? i : found),
      -1
    );
  };
  const log = (kind: Event['kind'], target: unknown) => {
    if (inDelivery > 0) events.push({ kind, deck: deckOf(target) });
  };
  // Patched by hand, and put back by hand: a spy on an accessor that a
  // failing test leaves behind would log into every later test.
  const restores: (() => void)[] = [];
  const patch = (
    target: object,
    name: string,
    part: 'value' | 'get' | 'set',
    kind: Event['kind'],
    after?: (result: unknown, self: unknown) => unknown
  ) => {
    const descriptor = Object.getOwnPropertyDescriptor(target, name)!;
    const original = descriptor[part] as (
      this: unknown,
      ...args: unknown[]
    ) => unknown;
    Object.defineProperty(target, name, {
      ...descriptor,
      [part]: function (this: unknown, ...args: unknown[]) {
        log(kind, args[0] instanceof Element ? args[0] : this);
        const result = original.apply(this, args);
        return after ? after(result, args[0]) : result;
      }
    });
    restores.push(() => Object.defineProperty(target, name, descriptor));
  };
  const wrap = (target: object, name: string, kind: Event['kind']) =>
    patch(target, name, 'value', kind);
  const accessor = (
    target: object,
    name: string,
    part: 'get' | 'set',
    kind: Event['kind']
  ) => patch(target, name, part, kind);
  // The declaration is live: reading a property off it after a write forces
  // a recalc as surely as a rect does, so each property read is logged too.
  patch(window, 'getComputedStyle', 'value', 'read', (style, el) => {
    return new Proxy(style as CSSStyleDeclaration, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (typeof value === 'function') return value.bind(target);
        log('read', el);
        return value;
      }
    });
  });
  wrap(Element.prototype, 'getBoundingClientRect', 'read');
  for (const name of [
    'scrollLeft',
    'scrollTop',
    'scrollWidth',
    'scrollHeight',
    'clientWidth',
    'clientHeight'
  ]) {
    accessor(Element.prototype, name, 'get', 'read');
  }
  for (const name of ['scrollLeft', 'scrollTop']) {
    accessor(Element.prototype, name, 'set', 'write');
  }
  wrap(CSSStyleDeclaration.prototype, 'setProperty', 'write');
  wrap(CSSStyleDeclaration.prototype, 'removeProperty', 'write');
  for (const [name, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(CSSStyleDeclaration.prototype)
  )) {
    if (descriptor.set && descriptor.configurable) {
      accessor(CSSStyleDeclaration.prototype, name, 'set', 'write');
    }
  }
  wrap(Element.prototype, 'scrollTo', 'write');
  wrap(Element.prototype, 'setAttribute', 'write');
  wrap(Element.prototype, 'removeAttribute', 'write');
  wrap(Element.prototype, 'toggleAttribute', 'write');

  const Native = window.ResizeObserver;
  window.ResizeObserver = class extends Native {
    constructor(callback: ResizeObserverCallback) {
      super((entries, observer) => {
        inDelivery++;
        try {
          callback(entries, observer);
        } finally {
          inDelivery--;
        }
      });
    }
  };
  // Restored whether the test passes or fails: a spy left over would log
  // into, and slow, every later test.
  onTestFinished(() => {
    window.ResizeObserver = Native;
    restores.forEach((restore) => restore());
  });
  return events;
}

/** A looping deck's viewport, rendering copies (not shells): a copy of the
 * five slides before them, and another after (ADR-0009). */
function buildCopies() {
  const viewport = build();
  const copies = (set: 'before' | 'after') =>
    [...viewport.children].map((slide) => {
      const copy = slide.cloneNode(true) as HTMLElement;
      copy.setAttribute(COPY, set);
      return copy;
    });
  viewport.prepend(...copies('before'));
  viewport.append(...copies('after'));
  return viewport;
}

function build() {
  const viewport = document.createElement('div');
  Object.assign(viewport.style, {
    display: 'flex',
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollSnapType: 'x mandatory',
    width: `${WIDTH}px`,
    height: '10px'
  });
  viewport.append(
    ...Array.from({ length: SLIDES }, () => {
      const slide = document.createElement('div');
      Object.assign(slide.style, {
        flexShrink: '0',
        width: `${WIDTH}px`,
        height: '10px',
        scrollSnapAlign: 'start'
      });
      return slide;
    })
  );
  document.body.append(viewport);
  return viewport;
}

const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Decks on `viewports`, each destroyed and removed with the test. */
function mount(
  viewports: HTMLElement[],
  {
    loop = false,
    onChange
  }: {
    loop?: boolean;
    onChange?: (deck: number, state: DeckState) => void;
  } = {}
) {
  const engines = viewports.map((viewport, i) =>
    createDeck(viewport, {
      index: 0,
      loop,
      onChange: (state) => onChange?.(i, state)
    })
  );
  onTestFinished(() => {
    engines.forEach((engine) => engine.destroy());
    viewports.forEach((viewport) => viewport.remove());
  });
  return engines;
}

/**
 * What one delivery owes (#339): no deck outside `optedOut` reads after any
 * deck's first write, and an opted-out deck, which reads live where it
 * writes, does nothing before the last write of every other deck.
 */
function expectBatched(events: Event[], optedOut: number[]) {
  const live = (e: Event) => optedOut.includes(e.deck);
  const firstWrite = events.findIndex((e) => e.kind === 'write');
  const lateReads = events
    .slice(firstWrite)
    .filter((e) => e.kind === 'read' && !live(e));
  expect(lateReads.map((e) => e.deck)).toEqual([]);
  const lastWrite = events
    .map((e) => e.kind === 'write' && !live(e))
    .lastIndexOf(true);
  const early = events.slice(0, lastWrite).filter(live);
  expect(early.map((e) => e.deck)).toEqual([]);
  expect(events.filter(live).length).toBeGreaterThan(0);
}

describe('decks share one resize delivery (#339)', () => {
  test('20 decks mounting read layout before any of them writes', async () => {
    const viewports: HTMLElement[] = [];
    const events = instrument(() => viewports);
    viewports.push(...Array.from({ length: DECKS }, build));
    mount(viewports);
    await frame();
    await frame();
    expect(events.filter((e) => e.kind === 'read').length).toBeGreaterThan(0);
    expect(events.filter((e) => e.kind === 'write').length).toBeGreaterThan(0);
    expect(
      events
        .slice(events.findIndex((e) => e.kind === 'write'))
        .filter((e) => e.kind === 'read')
        .map((e) => e.deck)
    ).toEqual([]);
  });

  test('a loop deck and a shells deck among 20 write after every other deck', async () => {
    addStyle(CENTRED);
    const COPIES = 6;
    const SHELLS = 13;
    const viewports: HTMLElement[] = [];
    const events = instrument(() => viewports);
    const plain = (count: number) => {
      const added = Array.from({ length: count }, build);
      viewports.push(...added);
      mount(added, { loop: false });
    };
    plain(COPIES);
    const copies = buildCopies();
    viewports.push(copies);
    mount([copies], { loop: true });
    plain(SHELLS - COPIES - 1);
    const { container } = render(<TestDeck loop viewportClassName="centred" />);
    viewports.push(viewportOf(container));
    plain(DECKS - SHELLS - 1);
    await frame();
    await frame();
    expect(viewports).toHaveLength(DECKS);
    expect(
      viewports[SHELLS].querySelector('[data-carouseldeck-shell]')
    ).not.toBe(null);
    expectBatched(events, [COPIES, SHELLS]);
  });

  test('a pressed deck writes after every other deck', async () => {
    const viewports: HTMLElement[] = [];
    const events = instrument(() => viewports);
    viewports.push(...Array.from({ length: 6 }, build));
    mount(viewports);
    viewports[0].dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        isPrimary: true,
        bubbles: true
      })
    );
    await frame();
    await frame();
    expectBatched(events, [0]);
  });

  test('two decks on one element both get its resizes', async () => {
    const viewport = build();
    const changes = [0, 0];
    mount([viewport, viewport], {
      onChange: (i) => {
        changes[i]++;
      }
    });
    await frame();
    await frame();
    const before = [...changes];
    // Two slides' worth more room: fewer places the deck can rest.
    viewport.style.width = `${2 * WIDTH}px`;
    await frame();
    await frame();
    expect(changes.map((count, i) => count > before[i])).toEqual([true, true]);
  });

  test('a deck inside a curved deck settles on the curve, as a live relayout does', async () => {
    // Slide 1 of the outer deck scales as its progress grows, as a curve
    // draws on a slide's content (ADR-0008): the outer deck's own write
    // moves the nested deck's boxes without resizing them, so a snapshot
    // read before it is stale by the time the nested deck settles.
    addStyle(
      '.outer > :nth-child(2) { scale: calc(1 - 0.5 * var(--deck-slide-progress, 0)); }'
    );
    const outer = build();
    outer.className = 'outer';
    const nested = build();
    outer.children[1].append(nested);
    const geometry = () => ({
      step: nested.style.getPropertyValue('--deck-viewport-step'),
      progress: [...nested.children].map((slide) =>
        (slide as HTMLElement).style.getPropertyValue('--deck-slide-progress')
      )
    });
    // What the nested deck has written when it publishes its first settle,
    // read then: a later settle of its own would correct a stale one.
    let published: (DeckState & ReturnType<typeof geometry>) | null = null;
    const engines = mount([outer, nested], {
      onChange: (i, state) => {
        if (i === 1) published ??= { ...state, ...geometry() };
      }
    });
    await frame();
    await frame();
    engines[1].refresh();
    expect(published).not.toBeNull();
    expect(published).toMatchObject(geometry());
    expect(geometry().step).not.toBe('100');
  });
});
