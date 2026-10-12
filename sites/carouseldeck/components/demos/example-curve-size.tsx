"use client";

import * as Deck from "@carouseldeck/react";
import { curve } from "@carouseldeck/react/curve";
import DemoFrame from "./demo-frame.tsx";

// The recipe's arc: a radius of 528px under slides 160px wide and 16px
// apart, and room for it in the viewport: styles/carouseldeck.css.
export default function CurveSize() {
  return (
    <DemoFrame>
      <Deck.Root aria-label="Sized curve" className="example-curve-size">
        <Deck.Viewport effect={curve}>
          {["One", "Two", "Three", "Four", "Five", "Six", "Seven"].map((name) => (
            <Deck.Slide key={name}>
              <div className="card">{name}</div>
            </Deck.Slide>
          ))}
        </Deck.Viewport>
        <Deck.Prev />
        <Deck.Next />
      </Deck.Root>
    </DemoFrame>
  );
}
