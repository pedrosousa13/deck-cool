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

/** One entry of claims.json, as read off disk (only the fields this module
 * reads; the gate script reads the rest). */
export interface ClaimsFileEntry {
  label: string;
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
  const lines = section.split("\n").filter((line) => line.trim().startsWith("|"));
  // lines[0] is the header row, lines[1] the `| --- | ... |` separator.
  return lines.slice(2).map((line) => {
    const cells = cellsOf(line);
    return { label: cells[0] ?? "", winner: cells[cells.length - 1] ?? "" };
  });
}

/** What a Winner cell's raw text claims for drawerdeck, or `null` when it
 * doesn't claim drawerdeck wins or ties this row at all (a rival's own win,
 * or several decks bolded together, as the feature-parity rows show). */
export function expectedClaim(winnerCell: string): ClaimsFileEntry["claim"] | null {
  const trimmed = winnerCell.trim();
  if (trimmed === "Tie") return "tie_or_better";
  if (trimmed === "**drawerdeck**") return "win";
  return null;
}

/** Every disagreement between compare.md's "At a glance" table and
 * claims.json, in both directions: a row claiming something claims.json
 * doesn't have, and a claims.json entry with no matching row. Empty means
 * they agree. */
export function diffClaims(markdown: string, claims: ClaimsFileEntry[]): string[] {
  const rows = parseAtAGlance(markdown);
  const byLabel = new Map(claims.map((claim) => [claim.label, claim]));
  const matched = new Set<string>();
  const problems: string[] = [];

  for (const { label, winner } of rows) {
    if (NON_BENCH_LABELS.has(label)) continue;
    const expected = expectedClaim(winner);
    const claim = byLabel.get(label);
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
      problems.push(`"${label}" claims "${expected}" in compare.md's At a glance table but has no entry in claims.json`);
    } else if (claim.claim !== expected) {
      problems.push(`"${label}": compare.md's table claims "${expected}", claims.json says "${claim.claim}"`);
    }
  }

  for (const claim of claims) {
    if (!matched.has(claim.label)) {
      problems.push(`claims.json's "${claim.label}" has no matching row in compare.md's At a glance table`);
    }
  }

  return problems;
}
