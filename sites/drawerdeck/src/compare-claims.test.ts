import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { diffClaims, expectedClaim, parseAtAGlance, type ClaimsFileEntry } from "./compare-claims.ts";

const FIXTURE = `# Comparison

**Verdict today:** filler.

## At a glance

| Question | drawerdeck | vaul | Winner |
| --- | --- | --- | --- |
| Bundle size (min+gzip, React external) | 9.00 KB | 22.58 KB | **drawerdeck** |
| Dropped frames while dragging, no load | 0.0% | 1.7% | Tie |
| Maintained? | Beta | No | **vaul** |

## Who closes on a flick

filler
`;

const MATCHING_CLAIMS: ClaimsFileEntry[] = [
  { label: "Bundle size (min+gzip, React external)", claim: "win" },
  { label: "Dropped frames while dragging, no load", claim: "tie_or_better" },
];

describe("parseAtAGlance", () => {
  test("reads the Question and Winner columns, stopping at the next heading", () => {
    expect(parseAtAGlance(FIXTURE)).toEqual([
      { label: "Bundle size (min+gzip, React external)", winner: "**drawerdeck**" },
      { label: "Dropped frames while dragging, no load", winner: "Tie" },
      { label: "Maintained?", winner: "**vaul**" },
    ]);
  });

  test("throws when the page has no At a glance section", () => {
    expect(() => parseAtAGlance("# No such section\n")).toThrow(/At a glance/);
  });
});

describe("expectedClaim", () => {
  test.each([
    ["Tie", "tie_or_better"],
    ["**drawerdeck**", "win"],
    ["**vaul**", null],
    ["**drawerdeck**, **Base UI**, **vaul**", null],
  ] as const)("%s -> %s", (winner, claim) => {
    expect(expectedClaim(winner)).toBe(claim);
  });
});

describe("diffClaims", () => {
  test("agrees when every bench row's Winner matches claims.json, and skips non-bench rows", () => {
    expect(diffClaims(FIXTURE, MATCHING_CLAIMS)).toEqual([]);
  });

  test("flags a row whose Winner no longer matches its claims.json entry", () => {
    const regressed = FIXTURE.replace(
      "| Bundle size (min+gzip, React external) | 9.00 KB | 22.58 KB | **drawerdeck** |",
      "| Bundle size (min+gzip, React external) | 9.00 KB | 22.58 KB | Tie |",
    );
    const problems = diffClaims(regressed, MATCHING_CLAIMS);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Bundle size/);
    expect(problems[0]).toMatch(/win/);
    expect(problems[0]).toMatch(/tie_or_better/);
  });

  test("flags a claims.json entry with no matching row in the table", () => {
    const extra: ClaimsFileEntry[] = [...MATCHING_CLAIMS, { label: "Longest stall while dragging, no load", claim: "tie_or_better" }];
    const problems = diffClaims(FIXTURE, extra);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Longest stall while dragging, no load/);
  });

  test("flags a claimed row missing from claims.json", () => {
    const problems = diffClaims(FIXTURE, [MATCHING_CLAIMS[0]!]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Dropped frames while dragging, no load/);
  });
});

describe("compare.md and claims.json agree", () => {
  const COMPARE_MD = fileURLToPath(new URL("../../../decks/drawerdeck/packages/docs/compare.md", import.meta.url));
  const CLAIMS_JSON = fileURLToPath(new URL("../../../decks/drawerdeck/bench/claims.json", import.meta.url));

  test("every At a glance row and every claims.json entry name the same claim", () => {
    const markdown = readFileSync(COMPARE_MD, "utf8");
    const claims = JSON.parse(readFileSync(CLAIMS_JSON, "utf8")) as ClaimsFileEntry[];
    expect(diffClaims(markdown, claims)).toEqual([]);
  });
});
