"use client";

import * as Deck from "@slidedeck/react";
import DemoFrame from "./demo-frame.tsx";

// Every primitive in one deck.
export default function Primitives() {
  return (
    <DemoFrame>
      <Deck.Root aria-label="Every primitive" autoplay={5000}>
        <Deck.Viewport>
          <Deck.Slide>One</Deck.Slide>
          <Deck.Slide>Two</Deck.Slide>
          <Deck.Slide>Three</Deck.Slide>
          <Deck.Slide>Four</Deck.Slide>
        </Deck.Viewport>
        <Deck.AutoplayToggle />
        <Deck.Prev />
        <Deck.Next />
        <Deck.Dots />
        <Deck.Counter />
      </Deck.Root>
    </DemoFrame>
  );
}
