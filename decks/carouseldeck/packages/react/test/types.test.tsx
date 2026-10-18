import { createRef, type ComponentProps } from 'react';
import { expectTypeOf, test } from 'vitest';
import * as Deck from '@carouseldeck/react';
import { curve } from '@carouseldeck/react/curve';
import { fade } from '@carouseldeck/react/fade';
import { stack } from '@carouseldeck/react/stack';

// Compile-time checks: `pnpm typecheck` fails if a line expected to error
// compiles, or an unmarked one does not.

const noop = (index: number) => void index;
const Root = Deck.Root;

test('a deck is uncontrolled, or controlled', () => {
  void (<Root />);
  void (<Root defaultIndex={1} />);
  void (<Root defaultIndex={1} onIndexChange={noop} />);
  void (<Root index={1} onIndexChange={noop} />);
  // Allowed, as a read-only input is: development warns instead.
  void (<Root index={1} />);

  // @ts-expect-error -- index and defaultIndex are either-or
  void (<Root index={1} defaultIndex={1} onIndexChange={noop} />);
  // @ts-expect-error -- an index is a number
  void (<Root index="1" onIndexChange={noop} />);
});

test('drag is a boolean, on unless turned off', () => {
  void (<Root drag />);
  void (<Root drag={false} />);
  // @ts-expect-error -- drag is on or off
  void (<Root drag="mouse" />);
});

test('orientation is horizontal or vertical', () => {
  void (<Root orientation="horizontal" />);
  void (<Root orientation="vertical" />);
  // @ts-expect-error -- direction comes from the document's dir, not a prop
  void (<Root orientation="rtl" />);
  expectTypeOf<Deck.Orientation>().toEqualTypeOf<'horizontal' | 'vertical'>();
});

test('autoplay is an interval in milliseconds', () => {
  void (<Root autoplay={5000} />);
  // @ts-expect-error -- autoplay takes its interval, not a switch
  void (<Root autoplay />);
});

test('the ref is the div, and handleRef is a RootHandle', () => {
  void (<Root ref={createRef<HTMLDivElement>()} />);
  void (<Root handleRef={createRef<Deck.RootHandle>()} />);
  // @ts-expect-error -- the ref is the region element, not the handle
  void (<Root ref={createRef<Deck.RootHandle>()} />);
  // @ts-expect-error -- handleRef is the handle, not the region element
  void (<Root handleRef={createRef<HTMLDivElement>()} />);

  expectTypeOf<Deck.RootHandle>().toEqualTypeOf<{
    scrollTo(index: number): void;
    next(): void;
    prev(): void;
  }>();
  expectTypeOf<ComponentProps<typeof Root>['onIndexChange']>().toEqualTypeOf<
    ((index: number) => void) | undefined
  >();
});

test('Dots and Counter render their own content, so take no children', () => {
  void (<Deck.Dots aria-label="Pick a photo" />);
  void (<Deck.Counter className="counter" />);
  // @ts-expect-error -- Dots render one button per page
  void (<Deck.Dots>dots</Deck.Dots>);
  // @ts-expect-error -- Counter renders "n / m"
  void (<Deck.Counter>1 of 5</Deck.Counter>);
});

test('useSlide reports the slide and whether it is a copy', () => {
  expectTypeOf(Deck.useSlide).returns.toEqualTypeOf<Deck.UseSlideResult>();
  expectTypeOf<Deck.UseSlideResult>().toEqualTypeOf<{
    index: number;
    copy: 'before' | 'after' | undefined;
  }>();
});

test("useDeck reports the deck's state and its moves", () => {
  expectTypeOf(Deck.useDeck).returns.toEqualTypeOf<Deck.UseDeckResult>();
  expectTypeOf<Deck.UseDeckResult>().toEqualTypeOf<{
    index: number;
    count: number | null;
    slide: number | null;
    focal: number | null;
    slideCount: number | null;
    loop: boolean;
    fits: boolean;
    canPrev: boolean;
    canNext: boolean;
    scrollTo(index: number): void;
    next(): void;
    prev(): void;
  }>();
});

test('an effect is imported from its own entry point, not named', () => {
  void (<Deck.Viewport effect={fade} />);
  void (<Deck.Viewport effect={curve} />);
  void (<Deck.Viewport effect={stack} />);
  expectTypeOf(fade).toEqualTypeOf<Deck.Effect>();
  expectTypeOf(curve).toEqualTypeOf<Deck.Effect>();
  expectTypeOf(stack).toEqualTypeOf<Deck.Effect>();
  // @ts-expect-error -- an effect is the imported value, not its name
  void (<Deck.Viewport effect="fade" />);
});
