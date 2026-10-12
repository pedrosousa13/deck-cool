"use client";

import * as Deck from "@slidedeck/react";
import DemoFrame from "./demo-frame.tsx";

// The Autoplay page's deck. The toggle comes after the slides, first among
// the controls, so the DOM, focus and visual orders agree.
export default function Autoplay() {
  return (
    <DemoFrame>
      <Deck.Root aria-label="Highlights" autoplay={5000} loop>
        <Deck.Viewport>
          <Deck.Slide>One</Deck.Slide>
          <Deck.Slide>Two</Deck.Slide>
          <Deck.Slide>Three</Deck.Slide>
        </Deck.Viewport>
        <Deck.AutoplayToggle />
        <Deck.Prev />
        <Deck.Next />
        <Deck.Dots />
      </Deck.Root>
    </DemoFrame>
  );
}
