import { afterEach, describe, expect, test, vi } from 'vitest';
import { createDeck } from '@carouseldeck/core';

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

type Event = 'read' | 'write';

function instrument() {
  const events: Event[] = [];
  let inDelivery = 0;
  const log = (event: Event) => {
    if (inDelivery > 0) events.push(event);
  };
  const wrap = <T extends object>(
    target: T,
    name: keyof T & string,
    event: Event
  ) => {
    const original = target[name] as unknown as (...args: unknown[]) => unknown;
    vi.spyOn(target, name as never).mockImplementation(function (
      this: unknown,
      ...args: unknown[]
    ) {
      log(event);
      return original.apply(this, args);
    } as never);
  };
  const getter = <T extends object>(target: T, name: string, event: Event) => {
    const descriptor = Object.getOwnPropertyDescriptor(target, name)!;
    vi.spyOn(target, name as never, 'get').mockImplementation(function (
      this: unknown
    ) {
      log(event);
      return descriptor.get!.call(this);
    } as never);
  };
  wrap(window, 'getComputedStyle', 'read');
  wrap(Element.prototype, 'getBoundingClientRect', 'read');
  for (const name of [
    'scrollLeft',
    'scrollTop',
    'scrollWidth',
    'scrollHeight',
    'clientWidth',
    'clientHeight'
  ]) {
    getter(Element.prototype, name, 'read');
  }
  wrap(CSSStyleDeclaration.prototype, 'setProperty', 'write');
  wrap(CSSStyleDeclaration.prototype, 'removeProperty', 'write');
  wrap(Element.prototype, 'scrollTo', 'write');
  wrap(Element.prototype, 'setAttribute', 'write');
  wrap(Element.prototype, 'removeAttribute', 'write');

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
  return {
    events,
    restore: () => {
      window.ResizeObserver = Native;
      vi.restoreAllMocks();
    }
  };
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('decks share one resize delivery (#339)', () => {
  test('20 decks mounting read layout before any of them writes', async () => {
    const spy = instrument();
    const viewports = Array.from({ length: DECKS }, build);
    const engines = viewports.map((viewport) =>
      createDeck(viewport, { index: 0, onChange: () => {} })
    );
    try {
      await frame();
      await frame();
      const { events } = spy;
      expect(events.filter((e) => e === 'read').length).toBeGreaterThan(0);
      expect(events.filter((e) => e === 'write').length).toBeGreaterThan(0);
      const firstWrite = events.indexOf('write');
      expect(events.slice(firstWrite)).not.toContain('read');
    } finally {
      spy.restore();
      engines.forEach((engine) => engine.destroy());
      viewports.forEach((viewport) => viewport.remove());
    }
  });
});
