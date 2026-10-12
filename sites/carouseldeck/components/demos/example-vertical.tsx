"use client";

import * as Deck from "@carouseldeck/react";
import DemoFrame from "./demo-frame.tsx";

// A vertical deck; styles/carouseldeck.css gives its viewport a height.
export default function Vertical() {
  return (
    <DemoFrame>
      <Deck.Root
        aria-label="Vertical slides"
        className="example-vertical"
        orientation="vertical"
      >
        <Deck.Viewport>
          <Deck.Slide>One</Deck.Slide>
          <Deck.Slide>Two</Deck.Slide>
          <Deck.Slide>Three</Deck.Slide>
        </Deck.Viewport>
        <Deck.Prev />
        <Deck.Next />
      </Deck.Root>
    </DemoFrame>
  );
}
