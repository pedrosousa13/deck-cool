"use client";

import * as Deck from "@slidedeck/react";
import DemoFrame from "./demo-frame.tsx";

// The deck the Quickstart's code block builds, written out again here: no
// check holds the two to each other.
export default function Quickstart() {
  return (
    <DemoFrame>
      <Deck.Root aria-label="Featured products">
        <Deck.Viewport>
          <Deck.Slide>Slide one</Deck.Slide>
          <Deck.Slide>Slide two</Deck.Slide>
          <Deck.Slide>Slide three</Deck.Slide>
        </Deck.Viewport>
        <Deck.Prev />
        <Deck.Next />
        <Deck.Dots />
        <Deck.Counter />
      </Deck.Root>
    </DemoFrame>
  );
}
