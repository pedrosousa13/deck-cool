#!/usr/bin/env python3
# Turns one results directory's chromium.jsonl into the markdown tables
# this bench reports locally (#340, ported from
# decks/drawerdeck/bench/report.py, #266): median, min-max spread and n per
# (deck, scenario, load, loop) cell. For the GitHub Actions workflow's own
# multi-shard report (medians pooled across every shard, plus a per-shard
# winner table), see aggregate.py instead -- this script reads one run's
# rows only, the way a local smoke/dev run produces them.
#
# Unlike drawerdeck's bench, a carousel has no open/close concept, so there
# is no "did not close" rule and no "unscoped (legacy)" columns here (see
# aggregate.py's own header comment). Fairness rule 11 ("a deck that does
# not respond to a gesture cannot win it") is the only exclusion, scoped to
# (deck, scenario, load, loop).
import json
import statistics as st
import sys

DECKS = ['carouseldeck', 'embla', 'keen', 'swiper', 'splide']
LOADS = [0, 100, 200]
LOOPS = [False, True]


def load(path):
    try:
        with open(path) as f:
            rows = [json.loads(l) for l in f if l.strip()]
    except FileNotFoundError:
        return []
    # Rule 6's warm-up rep, discarded: scored and recorded, but never part
    # of a reported median (see bench.spec.ts and aggregate.py).
    return [r for r in rows if not r.get('warmup')]


def fmt(values, digits=0):
    vals = [v for v in values if v is not None]
    if not vals:
        return 'n/a'
    med = st.median(vals)
    lo, hi = min(vals), max(vals)
    if digits == 0:
        return f'{med:.0f} ({lo:.0f}-{hi:.0f}, n={len(vals)})'
    return f'{med:.{digits}f} ({lo:.{digits}f}-{hi:.{digits}f}, n={len(vals)})'


def cell(rows, deck, scenario, load_, loop_, pick):
    g = [
        r
        for r in rows
        if r['deck'] == deck
        and r['scenario'] == scenario
        and r['load'] == load_
        and r['loop'] == loop_
    ]
    return fmt([pick(r) for r in g])


def not_supported(rows, deck, scenario, load_, loop_):
    # Fairness rule 11 (carried from drawerdeck's bench): a deck that never
    # responded to a scenario's own gesture (`responded`, false in more
    # than half of its reps for that scenario at that load/loop) cannot
    # win or tie it there. Scoped per load *and* loop, like every other
    # cell here (`cell`): a deck can respond at one load or loop setting
    # and not another.
    vals = [
        r.get('responded')
        for r in rows
        if r['deck'] == deck
        and r['scenario'] == scenario
        and r['load'] == load_
        and r['loop'] == loop_
    ]
    vals = [v for v in vals if v is not None]
    if not vals:
        return False
    return sum(1 for v in vals if v is False) > len(vals) / 2


def table(rows, scenario, pick, digits=0):
    cols = [(load_, loop_) for load_ in LOADS for loop_ in LOOPS]
    col_labels = [f'load={load_} loop={str(loop_).lower()}' for load_, loop_ in cols]
    lines = [
        '| Deck | ' + ' | '.join(col_labels) + ' |',
        '| --- | ' + ' | '.join('---' for _ in cols) + ' |',
    ]
    # Per (deck, load, loop), not once per row: a deck can be "not
    # supported" at one cell and fine at another.
    unsupported_cells = {}
    for deck in DECKS:
        cells = []
        for load_, loop_ in cols:
            if not_supported(rows, deck, scenario, load_, loop_):
                unsupported_cells.setdefault(deck, []).append((load_, loop_))
                cells.append('not supported')
            else:
                cells.append(cell(rows, deck, scenario, load_, loop_, pick))
        lines.append(f'| {deck} | ' + ' | '.join(cells) + ' |')
    if unsupported_cells:
        parts = ', '.join(
            f"{deck} ("
            + ', '.join(f"load {l} loop {str(lp).lower()}" for l, lp in cells_)
            + ")"
            for deck, cells_ in sorted(unsupported_cells.items())
        )
        lines.append('')
        lines.append(
            f"Not supported: {parts} did not respond to this gesture in most "
            'of its reps at that cell (fairness rule 11).'
        )
    return '\n'.join(lines)


if __name__ == '__main__':
    base = sys.argv[1] if len(sys.argv) > 1 else 'results'
    rows = load(f'{base}/chromium.jsonl')
    print(f'rows: {len(rows)}')

    print('\n### touch-swipe-next: longest stall (ms)\n')
    print(table(
        rows, 'touch-swipe-next',
        lambda r: r['trace']['longestStallMs'] if r['trace'] else None, 1,
    ))

    print('\n### touch-swipe-next: dropped frames (%)\n')
    print(table(
        rows, 'touch-swipe-next',
        lambda r: r['trace']['droppedPct'] if r['trace'] else None, 1,
    ))

    print('\n### touch-swipe-next: settle time (ms)\n')
    print(table(rows, 'touch-swipe-next', lambda r: r['settleMs']))

    print('\n### touch-swipe-next: motion after release (ms)\n')
    print(table(rows, 'touch-swipe-next', lambda r: r['motionAfterReleaseMs']))

    print('\n### touch-flick-three: longest stall (ms)\n')
    print(table(
        rows, 'touch-flick-three',
        lambda r: r['trace']['longestStallMs'] if r['trace'] else None, 1,
    ))

    print('\n### touch-flick-three: dropped frames (%)\n')
    print(table(
        rows, 'touch-flick-three',
        lambda r: r['trace']['droppedPct'] if r['trace'] else None, 1,
    ))

    print('\n### touch-flick-three: settle time (ms)\n')
    print(table(rows, 'touch-flick-three', lambda r: r['settleMs']))

    print('\n### touch-flick-three: motion after release (ms)\n')
    print(table(rows, 'touch-flick-three', lambda r: r['motionAfterReleaseMs']))

    print('\n### mouse-drag-release: settle time (ms)\n')
    print(table(rows, 'mouse-drag-release', lambda r: r['settleMs']))

    print('\n### mouse-drag-release: motion after release (ms)\n')
    print(table(rows, 'mouse-drag-release', lambda r: r['motionAfterReleaseMs']))

    print('\n### wheel-scroll-next: settle time (ms)\n')
    print(table(rows, 'wheel-scroll-next', lambda r: r['settleMs']))

    print('\n### wheel-scroll-next: motion after release (ms)\n')
    print(table(rows, 'wheel-scroll-next', lambda r: r['motionAfterReleaseMs']))

    print('\n### next-button: settle time (ms)\n')
    print(table(rows, 'next-button', lambda r: r['settleMs']))

    print('\n### next-button: motion after release (ms)\n')
    print(table(rows, 'next-button', lambda r: r['motionAfterReleaseMs']))

    print('\n### touch-swipe-next: LoAF total blocking (ms) / count\n')
    print(table(
        rows, 'touch-swipe-next',
        lambda r: r['loaf']['totalBlocking'] if r['loaf'] else None, 1,
    ))
    print()
    print(table(rows, 'touch-swipe-next', lambda r: r['loaf']['count'] if r['loaf'] else None))

    print('\n### touch-flick-three: LoAF total blocking (ms) / count\n')
    print(table(
        rows, 'touch-flick-three',
        lambda r: r['loaf']['totalBlocking'] if r['loaf'] else None, 1,
    ))
    print()
    print(table(rows, 'touch-flick-three', lambda r: r['loaf']['count'] if r['loaf'] else None))
