// Content and snap points every bench drawer shares (#266, originally
// #233), so a difference in the numbers is the mechanics, not the markup:
// the same 50-row list, and the same snap fractions of the viewport
// height -- half at 50%, full at 92%. Passed directly as vaul's and Base
// UI's `snapPoints` (both read a bare 0-1 number as "fraction of the
// viewport height"), as drawerdeck's own `scroller.clientHeight * fraction`
// snap offsets, and as the matching percentage strings for React Aria's
// Sheet (#283's `HALF_FRACTION_PCT`/`FULL_FRACTION_PCT`: its `snapPoints`
// reads a bare number as pixels and a percentage string as a fraction of
// the sheet's own box, not the viewport -- see src/reactaria-app.tsx for
// why that is the same number here in practice).

export const ROWS = 50;
export const HALF_FRACTION = 0.5;
export const FULL_FRACTION = 0.92;
export const HALF_FRACTION_PCT = `${HALF_FRACTION * 100}%`;
export const FULL_FRACTION_PCT = `${FULL_FRACTION * 100}%`;

export function buildRows(n: number): string {
  let html = '';
  for (let i = 1; i <= n; i++) {
    html += `<div class="bench-row">Row ${i}</div>`;
  }
  return html;
}

export function RowsReact(n: number) {
  const rows = [];
  for (let i = 1; i <= n; i++) {
    rows.push(i);
  }
  return rows;
}
