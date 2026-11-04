#!/usr/bin/env python3
# Turns one results directory's mount.jsonl into the markdown tables this
# bench reports locally: median, min-max spread and n per (deck, n, dirty,
# mode) cell, for each of mount.spec.ts's own metrics. For the GitHub
# Actions workflow's multi-shard report, see aggregate-mount.py instead --
# this script reads one run's own rows only, the way a local smoke/dev run
# produces them.
import json
import statistics as st
import sys

DECKS = ['carouseldeck', 'embla', 'keen', 'swiper', 'splide']
N_VALUES = [2, 20]
DIRTY = [False, True]
MODES = ['ssr', 'csr']

# (key, label, digits, extractor) -- each reads `row['mount']`, which is
# `None` when `analyzeMount` found no matching marks in that rep's trace
# (mount.spec.ts's own `record()` call writes `mount: null` then).
METRICS = [
    ('mountTaskMs', 'Main-thread busy time in the mount window (ms)', 1, lambda m: m['mountTaskMs']),
    ('layoutCount', 'Layout trace events in the window (count)', 0, lambda m: m['layoutCount']),
    ('layoutMs', 'Layout trace events in the window (ms)', 1, lambda m: m['layoutMs']),
    ('styleRecalcCount', 'Style-recalc (UpdateLayoutTree) trace events (count)', 0, lambda m: m['styleRecalcCount']),
    ('styleRecalcMs', 'Style-recalc (UpdateLayoutTree) trace events (ms)', 1, lambda m: m['styleRecalcMs']),
    ('timeToPublishedFrameMs', 'Time to the first frame after every instance published (ms)', 1, lambda m: m['timeToPublishedFrameMs']),
]


def load(path):
    try:
        with open(path) as f:
            rows = [json.loads(l) for l in f if l.strip()]
    except FileNotFoundError:
        return []
    # The warm-up rep, discarded (the same rule the gesture bench's
    # report.py/aggregate.py follow): scored and recorded, never part of a
    # reported median.
    return [r for r in rows if not r.get('warmup')]


def fmt(values, digits=0):
    vals = [v for v in values if v is not None]
    if not vals:
        return 'n/a'
    med = st.median(vals)
    lo, hi = min(vals), max(vals)
    return f'{med:.{digits}f} ({lo:.{digits}f}-{hi:.{digits}f}, n={len(vals)})'


def cell_values(rows, deck, n, dirty, mode, pick):
    g = [
        r for r in rows
        if r['deck'] == deck and r['n'] == n and r['dirty'] == dirty and r['mode'] == mode
    ]
    return [pick(r['mount']) for r in g if r.get('mount') is not None]


def table(rows, label, digits, pick):
    cols = [f'n={n} {"dirty" if dirty else "clean"} {mode}' for n in N_VALUES for dirty in DIRTY for mode in MODES]
    lines = [f'\n### {label}\n', '| Deck | ' + ' | '.join(cols) + ' |', '| --- | ' + ' | '.join('---' for _ in cols) + ' |']
    for deck in DECKS:
        cells = []
        for n in N_VALUES:
            for dirty in DIRTY:
                for mode in MODES:
                    cells.append(fmt(cell_values(rows, deck, n, dirty, mode, pick), digits))
        lines.append(f'| {deck} | ' + ' | '.join(cells) + ' |')
    return '\n'.join(lines)


if __name__ == '__main__':
    base = sys.argv[1] if len(sys.argv) > 1 else 'results'
    rows = load(f'{base}/mount.jsonl')
    print(f'rows: {len(rows)}')
    for _key, label, digits, pick in METRICS:
        print(table(rows, label, digits, pick))
        print()
