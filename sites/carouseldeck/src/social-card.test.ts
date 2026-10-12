import { expect, test } from "vitest";
import { lines, loadFont, socialCard } from "./social-card.ts";

test("breaks a headline between words, each line within the card's width", () => {
  const headline = "carouseldeck: a React carousel built on native scroll snap";
  const broken = lines(headline, 64, 1056);
  expect(broken.join(" ")).toBe(headline);
  for (const line of broken) expect(line.length * 64 * 0.6).toBeLessThanOrEqual(1056);
  expect(lines("Examples", 80, 1056)).toEqual(["Examples"]);
});

test("draws a 1200 by 630 PNG, from the headline or else the title", async () => {
  const card = socialCard("https://carousel.deck.cool");
  const page = {} as Parameters<typeof card.draw>[0]["page"];
  const drawn = await card.draw({ page, title: "A title", inputs: {} });
  expect([drawn.width, drawn.height]).toEqual([1200, 630]);
  expect(Buffer.from(drawn.bytes).subarray(1, 4).toString()).toBe("PNG");
  await expect(async () => card.draw({ page, title: undefined, inputs: {} })).rejects.toThrow(/no headline/);
});

test("fails, naming the file, when the card's font is missing", () => {
  expect(() => loadFont("/nowhere/Inter-SemiBold.woff")).toThrow(/\/nowhere\/Inter-SemiBold\.woff.*fonts\/OFL\.txt/);
});
