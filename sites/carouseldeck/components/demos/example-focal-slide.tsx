"use client";

import * as Deck from "@slidedeck/react";
import DemoFrame from "./demo-frame.tsx";

// Three slides in view, centred, so the focal slide is the middle one; a
// click brings a slide there. styles/slidedeck.css outlines `[data-focal]`.
export default function FocalSlide() {
  return (
    <DemoFrame>
      <Deck.Root aria-label="Focal slide" className="example-focal" clickToFocus>
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
