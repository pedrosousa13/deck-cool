"use client";

import * as Deck from "@carouseldeck/react";
import DemoFrame from "./demo-frame.tsx";

// A deck that loops, with part of each neighbour in view.
export default function Loop() {
  return (
    <DemoFrame>
      <Deck.Root aria-label="Looping slides" className="example-loop" loop>
        <Deck.Viewport>
          <Deck.Slide>One</Deck.Slide>
          <Deck.Slide>Two</Deck.Slide>
          <Deck.Slide>Three</Deck.Slide>
          <Deck.Slide>Four</Deck.Slide>
        </Deck.Viewport>
        <Deck.Prev />
        <Deck.Next />
        <Deck.Dots />
      </Deck.Root>
    </DemoFrame>
  );
}
