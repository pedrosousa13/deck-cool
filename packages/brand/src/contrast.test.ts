import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { decks } from "./decks.ts";

const css = readFileSync(new URL("../styles/brand.css", import.meta.url), "utf8");
const tokens = new Map<string, string>();
for (const [, name, value] of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
  if (name !== undefined && value !== undefined) tokens.set(name, value.trim());
}
const named = (pattern: RegExp) => [...tokens.keys()].filter((name) => pattern.test(name));

const grounds = named(/^--ground-/);
const fills = named(/^--[\w-]+-fill$/);
const texts = named(/^--text(-|$)|-text$/);

const pairs = [
  ...texts.flatMap((text) => grounds.map((surface) => [text, surface])),
  ...fills.map((surface) => ["--fill-text", surface]),
];

function luminance(hex: string): number {
  const digits = hex.slice(1);
  const full = digits.length === 3 ? [...digits].map((d) => d + d).join("") : digits;
  const channel = (at: number) => {
    const c = parseInt(full.slice(at, at + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function ratio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function hex(name: string): string {
  const value = tokens.get(name);
  if (value === undefined || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
    throw new Error(`${name} is not a hex colour in brand.css: ${String(value)}`);
  }
  return value;
}

test("brand.css has at least one ground, fill and text token to pair", () => {
  expect(grounds).not.toHaveLength(0);
  expect(fills).not.toHaveLength(0);
  expect(texts).not.toHaveLength(0);
});

test.each(pairs)("%s on %s passes WCAG AA (4.5:1)", (text, surface) => {
  expect(ratio(hex(text), hex(surface))).toBeGreaterThanOrEqual(4.5);
});

test.each(decks)("$name's accents match brand.css", ({ name, accent }) => {
  expect(hex(`--${name}-fill`)).toBe(accent.fill);
  expect(hex(`--${name}-text`)).toBe(accent.text);
});
