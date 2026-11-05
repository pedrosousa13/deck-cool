import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  diffClaims,
  expectedClaim,
  expectedLabel,
  parseAtAGlance,
  type ClaimsFileEntry,
} from "./compare-claims.ts";

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

const BUNDLE_CLAIM: ClaimsFileEntry = {
  label: "Bundle size (min+gzip, React external)",
  scenario: "bundle-size",
  metric: "bytes",
  load: null,
  claim: "win",
};

const DROPPED_FRAMES_CLAIM: ClaimsFileEntry = {
  label: "Dropped frames while dragging, no load",
  scenario: "touch-drag-half-full-back",
  metric: "droppedPct",
  load: 0,
  claim: "tie_or_better",
};

const LONGEST_STALL_CLAIM: ClaimsFileEntry = {
  label: "Longest stall while dragging, no load",
  scenario: "touch-drag-half-full-back",
  metric: "longestStallMs",
  load: 0,
  claim: "tie_or_better",
};

const MATCHING_CLAIMS: ClaimsFileEntry[] = [BUNDLE_CLAIM, DROPPED_FRAMES_CLAIM];

describe("parseAtAGlance", () => {
  test("reads the Question and Winner columns, stopping at the next heading", () => {
    expect(parseAtAGlance(FIXTURE)).toEqual([
      {
        label: "Bundle size (min+gzip, React external)",
        winner: "**drawerdeck**",
      },
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

describe("expectedLabel", () => {
  test("derives a bench row's label from its own scenario, metric and load", () => {
    expect(expectedLabel(DROPPED_FRAMES_CLAIM)).toBe(
      "Dropped frames while dragging, no load",
    );
    expect(expectedLabel({ ...DROPPED_FRAMES_CLAIM, load: 100 })).toBe(
      "Dropped frames while dragging, medium load (100ms busy tick)",
    );
    expect(expectedLabel(LONGEST_STALL_CLAIM)).toBe(
      "Longest stall while dragging, no load",
    );
    expect(expectedLabel(BUNDLE_CLAIM)).toBe(
      "Bundle size (min+gzip, React external)",
    );
  });

  test("returns null for a (scenario, metric) pair it doesn't recognise", () => {
    expect(
      expectedLabel({
        scenario: "open-to-half",
        metric: "longestStallMs",
        load: 0,
      }),
    ).toBeNull();
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
    const extra: ClaimsFileEntry[] = [...MATCHING_CLAIMS, LONGEST_STALL_CLAIM];
    const problems = diffClaims(FIXTURE, extra);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Longest stall while dragging, no load/);
  });

  test("flags a claimed row missing from claims.json", () => {
    const problems = diffClaims(FIXTURE, [MATCHING_CLAIMS[0]!]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/Dropped frames while dragging, no load/);
  });

  // Three mutations a reviewer of #276 found the original agreement check
  // never caught, since it only ever compared a claims.json entry's
  // `label` text against the table's -- never the entry's own
  // scenario/metric/load, and never for a duplicate label at all.

  test("flags a claims.json entry whose load no longer matches its own (unchanged) label", () => {
    const mutated: ClaimsFileEntry[] = [
      MATCHING_CLAIMS[0]!,
      { ...DROPPED_FRAMES_CLAIM, load: 100 },
    ];
    const problems = diffClaims(FIXTURE, mutated);
    expect(
      problems.some(
        (p) =>
          p.includes("Dropped frames while dragging, no load") &&
          p.includes("medium load"),
      ),
    ).toBe(true);
  });

  test("flags a claims.json entry whose scenario no longer matches its own label", () => {
    const mutated: ClaimsFileEntry[] = [
      MATCHING_CLAIMS[0]!,
      { ...DROPPED_FRAMES_CLAIM, scenario: "open-to-half" },
    ];
    const problems = diffClaims(FIXTURE, mutated);
    expect(
      problems.some((p) =>
        p.includes("Dropped frames while dragging, no load"),
      ),
    ).toBe(true);
  });

  test("flags a duplicate claims.json entry once, not as a second, confusing message", () => {
    const mutated: ClaimsFileEntry[] = [
      ...MATCHING_CLAIMS,
      { ...DROPPED_FRAMES_CLAIM },
    ];
    const problems = diffClaims(FIXTURE, mutated);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /more than one entry labelled "Dropped frames while dragging, no load"/,
    );
  });

  test("flags an unrecognised Winner cell on a bench row, instead of silently reading it as no claim", () => {
    const garbled = FIXTURE.replace(
      "| Dropped frames while dragging, no load | 0.0% | 1.7% | Tie |",
      "| Dropped frames while dragging, no load | 0.0% | 1.7% | tie |",
    );
    const problems = diffClaims(garbled, MATCHING_CLAIMS);
    expect(
      problems.some((p) =>
        p.includes("Dropped frames while dragging, no load"),
      ),
    ).toBe(true);
  });
});

describe("compare.md and claims.json agree", () => {
  const COMPARE_MD = fileURLToPath(
    new URL(
      "../../../decks/drawerdeck/packages/docs/compare.md",
      import.meta.url,
    ),
  );
  const CLAIMS_JSON = fileURLToPath(
    new URL("../../../decks/drawerdeck/bench/claims.json", import.meta.url),
  );

  test("every At a glance row and every claims.json entry name the same claim", () => {
    const markdown = readFileSync(COMPARE_MD, "utf8");
    const claims = JSON.parse(
      readFileSync(CLAIMS_JSON, "utf8"),
    ) as ClaimsFileEntry[];
    expect(diffClaims(markdown, claims)).toEqual([]);
  });
});
