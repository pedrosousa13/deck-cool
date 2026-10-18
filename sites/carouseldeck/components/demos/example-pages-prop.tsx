"use client";

import * as Deck from "@carouseldeck/react";
import DemoFrame from "./demo-frame.tsx";

// Three slides to a page, from a pageSize prop, not the stylesheet: an
// inline style always wins over CSS. Width still comes from
// styles/carouseldeck.css.
function Products({ names, pageSize }: { names: string[]; pageSize: number }) {
  return (
    <Deck.Viewport>
      {names.map((name, i) => (
        <Deck.Slide
          key={name}
          style={{ scrollSnapAlign: i % pageSize === 0 ? "start" : "none" }}
        >
          {name}
        </Deck.Slide>
      ))}
    </Deck.Viewport>
  );
}

const NAMES = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];

export default function PagesProp() {
  return (
    <DemoFrame>
      <Deck.Root aria-label="Pages from a prop" className="example-pages-prop">
        <Products names={NAMES} pageSize={3} />
        <Deck.Prev />
        <Deck.Next />
        <Deck.Dots />
        <Deck.Counter />
      </Deck.Root>
    </DemoFrame>
  );
}
