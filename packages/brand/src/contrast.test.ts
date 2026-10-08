import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { decks } from "./decks.ts";

// Pairs are picked by token name, so a token is checked the day it lands:
// - every text token (`--text`, `--text-*`, `--*-text`) on every ground (`--ground-*`);
// - `--fill-text` on every fill (`--*-fill`), the surface a button or a pill carries text on.
const css = readFileSync(new URL("../public/brand.css", import.meta.url), "utf8");
const tokens = new Map(
  [...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [
    name as string,
    (value as string).trim(),
  ]),
);
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
  const [r, g, b] = [0, 2, 4].map((at) => {
    const c = parseInt(full.slice(at, at + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function hex(name: string): string {
  const value = tokens.get(name);
  expect(value, name).toMatch(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  return value as string;
}

test("brand.css names grounds, fills and text by the pattern the pairs use", () => {
  expect(grounds).toEqual(["--ground-page", "--ground-tile", "--ground-raised"]);
  expect(fills).toEqual(["--slidedeck-fill", "--playdeck-fill", "--pagedeck-fill"]);
  expect(texts).toEqual([
    "--text",
    "--text-secondary",
    "--text-link",
    "--slidedeck-text",
    "--playdeck-text",
    "--pagedeck-text",
    "--fill-text",
  ]);
});

test.each(pairs)("%s on %s passes WCAG AA (4.5:1)", (text, surface) => {
  expect(ratio(hex(text), hex(surface))).toBeGreaterThanOrEqual(4.5);
});

test.each(decks)("$name's accents match brand.css", ({ name, accent }) => {
  expect(hex(`--${name}-fill`)).toBe(accent.fill);
  expect(hex(`--${name}-text`)).toBe(accent.text);
});
