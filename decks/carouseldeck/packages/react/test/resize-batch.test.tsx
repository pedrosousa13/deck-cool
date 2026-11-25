import { describe, expect, onTestFinished, test, vi } from 'vitest';
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
    return viewports().findIndex((viewport) => !!el && viewport.contains(el));
  };
  const log = (kind: Event['kind'], target: unknown) => {
    if (inDelivery > 0) events.push({ kind, deck: deckOf(target) });
  };
  const wrap = <T extends object>(
    target: T,
    name: keyof T & string,
    kind: Event['kind']
  ) => {
    const original = target[name] as unknown as (...args: unknown[]) => unknown;
    vi.spyOn(target, name as never).mockImplementation(function (
      this: unknown,
      ...args: unknown[]
    ) {
      log(kind, this);
      return original.apply(this, args);
    } as never);
  };
  const accessor = <T extends object>(
    target: T,
    name: string,
    access: 'get' | 'set',
    kind: Event['kind']
  ) => {
    const original = Object.getOwnPropertyDescriptor(target, name)![access] as (
      this: unknown,
      ...args: unknown[]
    ) => unknown;
    (
      vi.spyOn as (...args: unknown[]) => {
        mockImplementation(f: unknown): void;
      }
    )(target, name, access).mockImplementation(function (
      this: unknown,
      ...args: unknown[]
    ) {
      log(kind, this);
      return original.apply(this, args);
    });
  };
  const computed = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
    log('read', el);
    const style = computed(el, pseudo);
    return new Proxy(style, {
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
    vi.restoreAllMocks();
  });
  return events;
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
function mount(viewports: HTMLElement[]) {
  const engines = viewports.map((viewport) =>
    createDeck(viewport, { index: 0, onChange: () => {} })
  );
  onTestFinished(() => {
    engines.forEach((engine) => engine.destroy());
    viewports.forEach((viewport) => viewport.remove());
  });
  return engines;
}

/** A read of `deck`'s after the first write of any deck. */
const readsAfterAWrite = (events: Event[]) => {
  const firstWrite = events.findIndex((e) => e.kind === 'write');
  return events.slice(firstWrite).filter((e) => e.kind === 'read');
};

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
    expect(readsAfterAWrite(events)).toEqual([]);
  });
});
