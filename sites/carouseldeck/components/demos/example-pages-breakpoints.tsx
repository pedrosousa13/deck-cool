"use client";

import * as Deck from "@carouseldeck/react";
import DemoFrame from "./demo-frame.tsx";

// Two slides to a page below 640px, three from it, from data, not the
// stylesheet. The breakpoint itself stays in styles/carouseldeck.css.
function Products({ names }: { names: string[] }) {
  return (
    <Deck.Viewport>
      {names.map((name, i) => (
        <Deck.Slide
          key={name}
          data-page-start={i % 2 === 0 ? "" : undefined}
          data-page-start-640={i % 3 === 0 ? "" : undefined}
        >
          {name}
        </Deck.Slide>
      ))}
    </Deck.Viewport>
  );
}

const NAMES = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];

export default function PagesBreakpoints() {
  return (
    <DemoFrame>
      <Deck.Root
        aria-label="Pages per breakpoint"
        className="example-pages-breakpoints"
      >
        <Products names={NAMES} />
        <Deck.Prev />
        <Deck.Next />
        <Deck.Dots />
        <Deck.Counter />
      </Deck.Root>
    </DemoFrame>
  );
}
