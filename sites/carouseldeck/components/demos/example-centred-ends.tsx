"use client";

import * as Deck from "@slidedeck/react";
import DemoFrame from "./demo-frame.tsx";

// The recipe's CSS, in styles/slidedeck.css, on `.example-centred-ends`.
export default function CentredEnds() {
  return (
    <DemoFrame>
      <Deck.Root aria-label="Centred ends" className="example-centred-ends">
        <Deck.Viewport>
          <Deck.Slide>One</Deck.Slide>
          <Deck.Slide>Two</Deck.Slide>
          <Deck.Slide>Three</Deck.Slide>
          <Deck.Slide>Four</Deck.Slide>
          <Deck.Slide>Five</Deck.Slide>
        </Deck.Viewport>
        <Deck.Prev />
        <Deck.Next />
      </Deck.Root>
    </DemoFrame>
  );
}
