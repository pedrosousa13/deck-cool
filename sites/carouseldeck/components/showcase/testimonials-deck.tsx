"use client";

import * as Deck from "@slidedeck/react";

interface Testimonial {
  quote: string;
  name: string;
  role: string;
  /** The avatar's colour, by person rather than by position. */
  tone: "blue" | "green" | "orange" | "purple" | "teal";
}

// Sample copy: invented customers of Hearth & Kiln, an invented roastery.
const TESTIMONIALS: Testimonial[] = [
  {
    quote: "The beans arrive two days after roasting, and you can taste it.",
    name: "Maya Chen",
    role: "Home barista, Hearth & Kiln customer",
    tone: "blue"
  },
  {
    quote: "Our espresso has never pulled sweeter than with the house blend.",
    name: "Tomás Rivera",
    role: "Café owner, Hearth & Kiln customer",
    tone: "orange"
  },
  {
    quote: "Skipping a month of beans takes one click, and every bag is fresh.",
    name: "Priya Nair",
    role: "Subscriber, Hearth & Kiln customer",
    tone: "green"
  },
  {
    quote: "Every bag says where the coffee grew and how to brew it.",
    name: "Jonas Weber",
    role: "Coffee teacher, Hearth & Kiln customer",
    tone: "purple"
  },
  {
    quote: "Compostable bags, and a medium roast the whole office agrees on.",
    name: "Amara Okafor",
    role: "Office manager, Hearth & Kiln customer",
    tone: "teal"
  }
];

const initials = (name: string) =>
  name
    .split(" ")
    .map((word) => word[0])
    .join("");

/** Centred cards with their neighbours in view: the recipe "Centre the first
 * and last slide". */
export default function TestimonialsDeck() {
  return (
    <Deck.Root aria-label="Customer reviews" className="testimonials-deck">
      <Deck.Viewport>
        {TESTIMONIALS.map((item) => (
          <Deck.Slide key={item.name}>
            <figure className="testimonial">
              <blockquote>
                <p>“{item.quote}”</p>
              </blockquote>
              <figcaption>
                <span
                  className="testimonial-avatar"
                  data-tone={item.tone}
                  aria-hidden="true"
                >
                  {initials(item.name)}
                </span>
                <span>
                  <strong>{item.name}</strong>
                  <span>{item.role}</span>
                </span>
              </figcaption>
            </figure>
          </Deck.Slide>
        ))}
      </Deck.Viewport>
      <Deck.Prev />
      <Deck.Dots />
      <Deck.Next />
    </Deck.Root>
  );
}
