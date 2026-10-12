"use client";

import * as Deck from "@carouseldeck/react";
import DemoFrame from "./demo-frame.tsx";

// The controls in theme.css's plain look, with a few of its --deck-* tokens
// set on `.example-theme`. styles/demo-theme.css imports the theme, in a layer,
// and applies it to this example alone.
export default function Theme() {
  return (
    <DemoFrame>
      <Deck.Root
        aria-label="Themed slides"
        className="example-theme"
        autoplay={5000}
      >
        <Deck.Viewport>
          <Deck.Slide>One</Deck.Slide>
          <Deck.Slide>Two</Deck.Slide>
          <Deck.Slide>Three</Deck.Slide>
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
