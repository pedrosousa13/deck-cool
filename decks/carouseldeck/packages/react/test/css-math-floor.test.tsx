import { renderToString } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import * as Deck from '@carouseldeck/react';
import type { Effect, Orientation } from '@carouseldeck/react';
import theme from '@carouseldeck/react/theme.css?inline';
import packageJson from '../package.json?raw';

// #201, from the 2026-10-19 retrospective: the curve's CSS shipped sign() in
// #179's first version. Chromium 111-137 lack it, so the whole opacity
// declaration would have dropped there and every curve deck lost its fade.
// Only a reviewer caught it, and only curve had a check (folded in below,
// from curve-paint-and-fade.test.tsx). This test covers every CSS string the
// packages emit instead: the deck defaults, each effect's css and layout
// styles, and theme.css.

// Each is newer than the functions the package relies on today, asin() and
// sqrt(), past the package's floor, Chromium 111: an emitted declaration
// using one would be invalid there at computed-value time, dropping
// whatever it is part of.
const NEWER_THAN_FLOOR = [
  'sign(',
  'abs(',
  'round(',
  'mod(',
  'rem(',
  'exp(',
  'log(',
  'hypot(',
  'pow('
];

/**
 * The first of `NEWER_THAN_FLOOR` that `css` calls, or undefined. A call is
 * the function's name immediately followed by "(", with no identifier
 * character or hyphen right before it: a custom property such as
 * `--carouseldeck-curve-round` does not call round() (there is no "(" after
 * it at all), and neither does a longer word that happens to end the same
 * way, such as `background(`, which contains "round(" but is not a call to
 * it.
 */
function newerFunctionIn(css: string): string | undefined {
  return NEWER_THAN_FLOOR.find((fn) => {
    const name = fn.slice(0, -1);
    return new RegExp(`(?<![\\w-])${name}\\(`).test(css);
  });
}

describe('newerFunctionIn', () => {
  test('matches a real call', () => {
    expect(newerFunctionIn('opacity:round(1,1)')).toBe('round(');
  });

  test('ignores a custom property of the same name, with no call', () => {
    expect(
      newerFunctionIn('--carouseldeck-curve-round:1;opacity:1')
    ).toBeUndefined();
  });

  test('ignores the name as the tail of a longer word', () => {
    expect(newerFunctionIn('content:"background(1)"')).toBeUndefined();
  });

  test('still catches a call with no space before it', () => {
    expect(newerFunctionIn('z-index:1}sign(1)')).toBe('sign(');
  });
});

// Every effect module under src/: an object with a `name` and a `css`
// string, the shape `Effect` describes. Discovered by file, not by name, so
// a new effect module needs no edit here to be covered.
function isEffect(value: unknown): value is Effect {
  const candidate = value as { name?: unknown; css?: unknown } | null;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof candidate.name === 'string' &&
    typeof candidate.css === 'string'
  );
}

const effectModules = import.meta.glob(['../src/*.ts', '../src/*.tsx'], {
  eager: true
}) as Record<string, Record<string, unknown>>;

const effects: Effect[] = Object.values(effectModules).flatMap((mod) =>
  Object.values(mod).filter(isEffect)
);

// Cross-checked against the package's own exports map: every subpath but the
// main entry and theme.css is an effect, named after it.
const { exports: packageExports } = JSON.parse(packageJson) as {
  exports: Record<string, unknown>;
};
const exportedEffectNames = Object.keys(packageExports)
  .filter((subpath) => subpath !== '.' && subpath !== './theme.css')
  .map((subpath) => subpath.slice(2));

test('discovers exactly the effects the package exports', () => {
  expect(effects.map((effect) => effect.name).sort()).toEqual(
    exportedEffectNames.sort()
  );
});

const ORIENTATIONS: Orientation[] = ['horizontal', 'vertical'];
const COUNTS = [1, 2, 5];

/** Every CSS value an effect's `layout` can write, inline, for a few
 * orientations and slide counts: stringified, so the same matcher reads
 * them as it reads a stylesheet string. */
function layoutCssSources(effect: Effect): string[] {
  if (!effect.layout) return [];
  const sources: string[] = [];
  for (const orientation of ORIENTATIONS) {
    for (const count of COUNTS) {
      const { viewport, slide, target } = effect.layout(orientation, count);
      sources.push(JSON.stringify(viewport ?? null));
      sources.push(JSON.stringify(slide ?? null));
      if (target) {
        for (let index = 0; index < count; index++) {
          sources.push(JSON.stringify(target(index)));
        }
      }
    }
  }
  return sources;
}

describe.each(effects)('$name', (effect) => {
  test('css emits no CSS math function newer than the floor', () => {
    expect(newerFunctionIn(effect.css)).toBeUndefined();
  });

  test('layout styles emit no CSS math function newer than the floor', () => {
    for (const css of layoutCssSources(effect)) {
      expect(newerFunctionIn(css)).toBeUndefined();
    }
  });
});

/** The CSS `Deck.Viewport` always emits, in `deckDefaults`: not exported, so
 * read back from a render rather than imported directly. */
function renderedDeckDefaults(): string {
  const container = document.createElement('div');
  container.innerHTML = renderToString(
    <Deck.Root aria-label="css math floor check">
      <Deck.Viewport style={{ width: 300 }}>
        <Deck.Slide>slide</Deck.Slide>
      </Deck.Viewport>
    </Deck.Root>
  );
  // React 19 recognises `href`/`precedence` on a `<style>` as a resource it
  // dedupes, and renders `href` back as `data-href`; React 18, built from
  // the same source (vite.config.ts), has no such resource and drops both
  // attributes as unknown. Either way, a Viewport with no effect renders
  // exactly one `<style>`, deckDefaults alone, so the element itself is
  // enough: no attribute to select it by is common to both.
  const style = container.querySelector('style');
  if (!style) {
    throw new Error('Deck.Viewport did not render its deck-defaults style');
  }
  return style.textContent ?? '';
}

test('the deck defaults emit no CSS math function newer than the floor', () => {
  expect(newerFunctionIn(renderedDeckDefaults())).toBeUndefined();
});

test('theme.css emits no CSS math function newer than the floor', () => {
  expect(newerFunctionIn(theme)).toBeUndefined();
});
