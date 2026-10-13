"use client";

import * as Deck from "@carouseldeck/react";
import { stack } from "@carouseldeck/react/stack";
import { VIEWS, type Photo } from "./photos.ts";

interface View {
  name: string;
  line: string;
  photo: Photo;
}

const VIEW_LIST: View[] = [
  { name: "Valley", line: "Mist on green slopes", photo: VIEWS.valley },
  { name: "Waterfall", line: "Falls in the woods", photo: VIEWS.waterfall },
  { name: "Peaks", line: "Snow on the range", photo: VIEWS.summit },
  { name: "Shore", line: "Rocks on a still bay", photo: VIEWS.shore },
  { name: "Pines", line: "Woods above the sound", photo: VIEWS.pines }
];

/** A card stack: `effect={stack}` on photo cards, looping, the card stack
 * recipe's fanned look. Each card's Next throws it out and back in behind
 * the stack. Every card but the top one is inert, so only the top card's
 * Next can be pressed. */
export default function CardStackDeck() {
  return (
    <Deck.Root aria-label="Views" className="card-stack-deck" loop>
      <Deck.Viewport effect={stack}>
        {VIEW_LIST.map((view) => (
          <Deck.Slide key={view.name}>
            {/* The recipe's CSS draws on the slide's one child. */}
            <div className="photo-card">
              <img
                src={view.photo.src}
                width={view.photo.width}
                height={view.photo.height}
                alt={view.photo.alt}
                loading="lazy"
              />
              <div className="photo-card-caption">
                <div>
                  <h3>{view.name}</h3>
                  <p>{view.line}</p>
                </div>
                <Deck.Next />
              </div>
            </div>
          </Deck.Slide>
        ))}
      </Deck.Viewport>
    </Deck.Root>
  );
}
