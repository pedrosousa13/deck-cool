"use client";

import * as Deck from "@carouseldeck/react";
import { STORIES, type Photo } from "./photos.ts";

interface Story {
  title: string;
  caption: string;
  photo: Photo;
}

const ITEMS: Story[] = [
  {
    title: "City morning",
    caption: "Cobbles before the shops open.",
    photo: STORIES.street
  },
  {
    title: "Harvest",
    caption: "The first grapes come in on Monday.",
    photo: STORIES.grapes
  },
  {
    title: "High trail",
    caption: "Four hours up. Worth it.",
    photo: STORIES.trail
  },
  {
    title: "Supper",
    caption: "Tonight’s table, set early.",
    photo: STORIES.forks
  }
];

/** Stories: `orientation="vertical"` in a phone-shaped frame, full height. */
export default function StoriesDeck() {
  return (
    <Deck.Root
      aria-label="Travel stories"
      className="stories-deck"
      orientation="vertical"
    >
      <Deck.Viewport>
        {ITEMS.map((story) => (
          <Deck.Slide key={story.title}>
            <figure className="story">
              <img
                src={story.photo.src}
                width={story.photo.width}
                height={story.photo.height}
                alt={story.photo.alt}
                loading="lazy"
              />
              <figcaption>
                <h3>{story.title}</h3>
                <p>{story.caption}</p>
              </figcaption>
            </figure>
          </Deck.Slide>
        ))}
      </Deck.Viewport>
      <Deck.Prev />
      <Deck.Counter />
      <Deck.Next />
    </Deck.Root>
  );
}
