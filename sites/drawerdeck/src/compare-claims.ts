// Keeps decks/drawerdeck/packages/docs/compare.md's "At a glance" table and
// decks/drawerdeck/bench/claims.json (#276) saying the same thing: that
// file is the one machine-readable list of what the comparison page
// claims, and the CI bench gate (claims_gate.py) checks exactly it. If this
// drifts, the gate silently stops matching the page, or the page silently
// claims something the gate never checks.

/** One row of the "At a glance" table, by its own two outer columns. */
export interface AtAGlanceRow {
  label: string;
  winner: string;
}

/** One entry of claims.json, as read off disk. `scenario`, `metric` and
 * `load` are also what claims_gate.py reads to find the cell; this module
 * reads them too (#348's review of #276), to catch a `label` that no
 * longer matches its own (scenario, metric, load) -- the load changing
 * under an unchanged label, say, or the scenario changing under both. */
export interface ClaimsFileEntry {
  label: string;
  scenario: string;
  metric: string;
  load: number | null;
  claim: "win" | "tie_or_better";
}

/** Rows that compare at-a-glance but aren't bench-measured claims: feature
 * and maintenance facts, not a (scenario, metric, load) cell aggregate.py
 * scores. Exhaustive on purpose -- a new row here needs a deliberate add,
 * the same way a new bench claim needs a deliberate claims.json entry. */
const NON_BENCH_LABELS = new Set([
  "Maintained?",
  "Features: all sides, non-modal, nesting, background indent, keyboard",
  "Built on native `<dialog>` and native scrolling",
  "React versions",
]);

/** The exact bolded text compare.md's Winner column uses to name a rival
 * outright (a clear loss for drawerdeck). Kept in sync by hand with the
 * table, the same way NON_BENCH_LABELS is. */
const RIVALS = ["vaul", "Base UI", "React Aria"];

/** compare.md's own "X, <load suffix>" convention for a bench row's
 * Question column, and aggregate.py's own `label` prefix for each
 * (scenario, metric) pair it scores (`METRICS` in aggregate.py). Used to
 * derive what a claims.json entry's `label` ought to read from its own
 * `scenario`/`metric`/`load`, so a scenario, metric or load that changes
 * without its label following is caught, not silently reinterpreted. */
const LOAD_SUFFIX: Record<string, string> = {
  "0": "no load",
  "100": "medium load (100ms busy tick)",
  "200": "heavy load (200ms busy tick)",
};

const CELL_LABEL_PREFIX: Record<string, string> = {
  "touch-drag-half-full-back:droppedPct": "Dropped frames while dragging",
  "touch-drag-half-full-back:longestStallMs": "Longest stall while dragging",
  "touch-flick-dismiss:settleMs": "Flick down closes it: settle time",
  "mouse-drag-throw:settleMs": "Mouse throw: settle time",
  "open-to-half:settleMs": "Open to half: settle time",
};

/** The label a claims.json entry's own (scenario, metric, load) implies,
 * or `null` when the (scenario, metric) pair or the load isn't one this
 * module knows how to render -- an unrecognised cell, not silently
 * accepted. Bundle size has its own fixed label, no load suffix. */
export function expectedLabel(
  entry: Pick<ClaimsFileEntry, "scenario" | "metric" | "load">,
): string | null {
  if (entry.scenario === "bundle-size") {
    return "Bundle size (min+gzip, React external)";
  }
  const prefix = CELL_LABEL_PREFIX[`${entry.scenario}:${entry.metric}`];
  const suffix =
    entry.load === null ? undefined : LOAD_SUFFIX[String(entry.load)];
  if (!prefix || !suffix) return null;
  return `${prefix}, ${suffix}`;
}

/** Whether a bench row's raw Winner text is one `expectedClaim` can make
 * sense of: "Tie", drawerdeck bolded, or exactly one rival named and
 * bolded (a clear loss, which claims.json never lists a claim for). Any
 * other text -- a typo, an unbolded name, two rivals bolded together --
 * is unrecognised, not silently read as "no claim". */
function isRecognizedWinnerText(trimmed: string): boolean {
  if (trimmed === "Tie" || trimmed === "**drawerdeck**") return true;
  return RIVALS.some((rival) => trimmed === `**${rival}**`);
}

function cellsOf(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** Parses the "## At a glance" markdown table into its rows, by the
 * Question column (the claim's label) and the Winner column (its raw,
 * un-decoded cell text). Throws if the page has no such section: a
 * missing section is not "no claims", it's the page having changed shape
 * under this check. */
export function parseAtAGlance(markdown: string): AtAGlanceRow[] {
  const heading = "## At a glance";
  const start = markdown.indexOf(heading);
  if (start === -1) throw new Error(`compare.md has no "${heading}" section`);
  const rest = markdown.slice(start + heading.length);
  const nextHeading = rest.indexOf("\n## ");
  const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
  const lines = section
    .split("\n")
    .filter((line) => line.trim().startsWith("|"));
  // lines[0] is the header row, lines[1] the `| --- | ... |` separator.
  return lines.slice(2).map((line) => {
    const cells = cellsOf(line);
    return { label: cells[0] ?? "", winner: cells[cells.length - 1] ?? "" };
  });
}

/** What a Winner cell's raw text claims for drawerdeck, or `null` when it
 * doesn't claim drawerdeck wins or ties this row at all (a rival's own win,
 * or several decks bolded together, as the feature-parity rows show). */
export function expectedClaim(
  winnerCell: string,
): ClaimsFileEntry["claim"] | null {
  const trimmed = winnerCell.trim();
  if (trimmed === "Tie") return "tie_or_better";
  if (trimmed === "**drawerdeck**") return "win";
  return null;
}

/** Every disagreement between compare.md's "At a glance" table and
 * claims.json, in both directions: a row claiming something claims.json
 * doesn't have, a claims.json entry with no matching row, a claims.json
 * entry whose label doesn't match its own scenario/metric/load, a
 * duplicate claims.json entry, and an unrecognised Winner cell on a bench
 * row. Empty means they agree.
 *
 * Duplicate labels are reported once, as their own problem, and then
 * skipped by every other check below -- not also flagged "no matching
 * row" or "label doesn't match", which would just be noise about the
 * same root cause. */
export function diffClaims(
  markdown: string,
  claims: ClaimsFileEntry[],
): string[] {
  const rows = parseAtAGlance(markdown);
  const problems: string[] = [];

  const byLabel = new Map<string, ClaimsFileEntry>();
  const duplicated = new Set<string>();
  for (const claim of claims) {
    if (byLabel.has(claim.label)) {
      duplicated.add(claim.label);
    } else {
      byLabel.set(claim.label, claim);
    }
  }
  for (const label of duplicated) {
    problems.push(`claims.json has more than one entry labelled "${label}"`);
  }

  for (const claim of claims) {
    if (duplicated.has(claim.label)) continue;
    const expected = expectedLabel(claim);
    if (expected === null) {
      problems.push(
        `claims.json's "${claim.label}" names a (scenario, metric, load) this check doesn't recognise (scenario: ${claim.scenario}, metric: ${claim.metric}, load: ${claim.load})`,
      );
    } else if (expected !== claim.label) {
      problems.push(
        `claims.json's "${claim.label}" entry's own scenario/metric/load imply the label "${expected}", not "${claim.label}"`,
      );
    }
  }

  const matched = new Set<string>();

  for (const { label, winner } of rows) {
    if (NON_BENCH_LABELS.has(label)) continue;
    if (!isRecognizedWinnerText(winner)) {
      problems.push(
        `"${label}"'s Winner ("${winner}") is neither drawerdeck, a tie, nor a named rival -- compare.md's table changed shape here`,
      );
      continue;
    }
    const expected = expectedClaim(winner);
    const claim = duplicated.has(label) ? undefined : byLabel.get(label);
    if (expected === null) {
      if (claim) {
        problems.push(
          `"${label}" is in claims.json (claim: ${claim.claim}) but compare.md's Winner ("${winner}") no longer claims drawerdeck wins or ties it`,
        );
      }
      continue;
    }
    matched.add(label);
    if (!claim) {
      if (!duplicated.has(label)) {
        problems.push(
          `"${label}" claims "${expected}" in compare.md's At a glance table but has no entry in claims.json`,
        );
      }
    } else if (claim.claim !== expected) {
      problems.push(
        `"${label}": compare.md's table claims "${expected}", claims.json says "${claim.claim}"`,
      );
    }
  }

  for (const claim of claims) {
    if (duplicated.has(claim.label)) continue;
    if (!matched.has(claim.label)) {
      problems.push(
        `claims.json's "${claim.label}" has no matching row in compare.md's At a glance table`,
      );
    }
  }

  return problems;
}
