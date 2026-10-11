"use client";

import * as Deck from "@slidedeck/react";
import DemoFrame from "./demo-frame.tsx";

// The recipe's first way, centred slides: styles/slidedeck.css.
export default function MiddleCentred() {
  return (
    <DemoFrame>
      <Deck.Root
        aria-label="Middle slide, centred"
        className="example-middle-centred"
      >
        <Deck.Viewport>
          <Deck.Slide>One</Deck.Slide>
          <Deck.Slide>Two</Deck.Slide>
          <Deck.Slide>Three</Deck.Slide>
          <Deck.Slide>Four</Deck.Slide>
          <Deck.Slide>Five</Deck.Slide>
          <Deck.Slide>Six</Deck.Slide>
        </Deck.Viewport>
        <Deck.Prev />
        <Deck.Next />
      </Deck.Root>
    </DemoFrame>
  );
}
