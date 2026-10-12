"use client";

import * as Deck from "@slidedeck/react";
import { PRODUCTS, THUMBS, type Photo } from "./photos.ts";

interface Product {
  name: string;
  price: string;
  photo: Photo;
  thumb: Photo;
}

const ITEMS: Product[] = [
  {
    name: "Ivory heels",
    price: "$189",
    photo: PRODUCTS.heels,
    thumb: THUMBS.heels
  },
  {
    name: "Everyday carry kit",
    price: "$240",
    photo: PRODUCTS.carry,
    thumb: THUMBS.carry
  },
  { name: "Stamp mug", price: "$24", photo: PRODUCTS.mug, thumb: THUMBS.mug },
  {
    name: "House blend",
    price: "$16",
    photo: PRODUCTS.coffee,
    thumb: THUMBS.coffee
  }
];

/** A thumbnail per page in place of dots: the custom controls recipe, with
 * an image in each page button. None until the deck is measured, as
 * `count` is null on the server, so no button is in the HTML before it can
 * work. It reads the deck only when it settles. */
function Thumbnails({ eager }: { eager: boolean }) {
  const { index, count, fits, scrollTo } = Deck.useDeck();
  // Space for the row either way, so it does not shift the page in.
  return (
    <div className="gallery-thumbs">
      {!fits && count !== null && (
        <div role="group" aria-label="Choose page">
          {Array.from({ length: count }, (_, page) => {
            const item = ITEMS[page];
            return (
              <button
                key={item.name}
                type="button"
                aria-label={`Show ${item.name}`}
                aria-current={page === index ? "true" : undefined}
                onClick={() => scrollTo(page)}
              >
                {/* Eager where the gallery is above the fold. */}
                <img
                  src={item.thumb.src}
                  width={item.thumb.width}
                  height={item.thumb.height}
                  alt=""
                  loading={eager ? "eager" : "lazy"}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Large product photos with thumbnails as the dots. `eager` loads the first
 * photo at once, for a page where the gallery is above the fold. */
export default function GalleryDeck({ eager = false }: { eager?: boolean }) {
  return (
    <Deck.Root aria-label="Product photos" className="gallery-deck">
      <Deck.Viewport>
        {ITEMS.map((item, i) => (
          <Deck.Slide key={item.name}>
            <figure className="gallery-slide">
              <img
                src={item.photo.src}
                width={item.photo.width}
                height={item.photo.height}
                alt={item.photo.alt}
                loading={eager && i === 0 ? "eager" : "lazy"}
              />
              <figcaption>
                <h3>{item.name}</h3>
                <p>{item.price}</p>
              </figcaption>
            </figure>
          </Deck.Slide>
        ))}
      </Deck.Viewport>
      <Thumbnails eager={eager} />
    </Deck.Root>
  );
}
