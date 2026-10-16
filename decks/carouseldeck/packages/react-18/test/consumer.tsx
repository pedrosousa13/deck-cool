// A consumer of the React 18 build, type-checked with React 18's own types by
// tsconfig.test.json: every primitive takes a ref to its element.
import { createRef } from 'react';
import * as Deck from '@carouseldeck/react';
import { fade } from '@carouseldeck/react/fade';
import { stack } from '@carouseldeck/react/stack';

const region = createRef<HTMLDivElement>();
const slide = createRef<HTMLDivElement>();
const prev = createRef<HTMLButtonElement>();
const counter = createRef<HTMLSpanElement>();
const handle = createRef<Deck.RootHandle>();

export const App = () => (
  <Deck.Root ref={region} handleRef={handle} aria-label="Slides" loop>
    <Deck.Viewport effect={fade}>
      <Deck.Slide ref={slide}>One</Deck.Slide>
      <Deck.Slide>Two</Deck.Slide>
    </Deck.Viewport>
    <Deck.Prev ref={prev} />
    <Deck.Next />
    <Deck.Dots />
    <Deck.Counter ref={counter} />
  </Deck.Root>
);

// @ts-expect-error -- orientation is horizontal or vertical
void (<Deck.Root orientation="rtl" />);

void (<Deck.Viewport effect={stack} />);
