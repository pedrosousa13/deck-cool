#!/usr/bin/env python3
# Turns one results directory's chromium.jsonl into the markdown tables
# this bench reports locally: median, min-max spread and n per
# (deck, scenario, load) cell. For the GitHub Actions workflow's own
# multi-shard report (medians pooled across every shard, plus a per-shard
# winner table), see aggregate.py instead -- this script reads one run's
# rows only, the way a local smoke/dev run produces them.
import json
import statistics as st
import sys

DECKS = ['drawerdeck', 'vaul', 'baseui', 'reactaria']
LOADS = [0, 100, 200]


def load(path):
    try:
        with open(path) as f:
            return [json.loads(l) for l in f if l.strip()]
    except FileNotFoundError:
        return []


def fmt(values, digits=0):
    vals = [v for v in values if v is not None]
    if not vals:
        return 'n/a'
    med = st.median(vals)
    lo, hi = min(vals), max(vals)
    if digits == 0:
        return f'{med:.0f} ({lo:.0f}-{hi:.0f}, n={len(vals)})'
    return f'{med:.{digits}f} ({lo:.{digits}f}-{hi:.{digits}f}, n={len(vals)})'


def cell(rows, deck, scenario, load_, pick):
    g = [r for r in rows if r['deck'] == deck and r['scenario'] == scenario and r['load'] == load_]
    return fmt([pick(r) for r in g])


def table(rows, scenario, pick, digits=0):
    lines = [f'| Deck | load=0 | load=100 | load=200 |', '| --- | --- | --- | --- |']
    for deck in DECKS:
        cells = [cell(rows, deck, scenario, load_, pick) for load_ in LOADS]
        lines.append(f'| {deck} | {cells[0]} | {cells[1]} | {cells[2]} |')
    return '\n'.join(lines)


if __name__ == '__main__':
    base = sys.argv[1] if len(sys.argv) > 1 else 'results'
    rows = load(f'{base}/chromium.jsonl')
    print(f'rows: {len(rows)}')

    print('\n### touch-drag-half-full-back: longest stall (ms)\n')
    print(table(rows, 'touch-drag-half-full-back', lambda r: r['trace']['longestStallMs'] if r['trace'] else None, 1))

    print('\n### touch-drag-half-full-back: dropped frames (%)\n')
    print(table(rows, 'touch-drag-half-full-back', lambda r: r['trace']['droppedPct'] if r['trace'] else None, 1))

    print('\n### touch-flick-dismiss: settle time (ms)\n')
    print(table(rows, 'touch-flick-dismiss', lambda r: r['settleMs']))

    print('\n### touch-flick-dismiss: ended closed (opennessAfter px)\n')
    print(table(rows, 'touch-flick-dismiss', lambda r: r['opennessAfter']))

    print('\n### mouse-drag-throw: settle time (ms)\n')
    print(table(rows, 'mouse-drag-throw', lambda r: r['settleMs']))

    print('\n### open-to-half: settle time (ms)\n')
    print(table(rows, 'open-to-half', lambda r: r['settleMs']))

    print('\n### touch-drag-half-full-back: LoAF total blocking (ms) / count\n')
    print(table(rows, 'touch-drag-half-full-back', lambda r: r['loaf']['totalBlocking'] if r['loaf'] else None, 1))
    print()
    print(table(rows, 'touch-drag-half-full-back', lambda r: r['loaf']['count'] if r['loaf'] else None))
