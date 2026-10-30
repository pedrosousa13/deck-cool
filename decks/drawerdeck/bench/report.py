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


def cell(rows, deck, scenario, load_, pick):
    g = [r for r in rows if r['deck'] == deck and r['scenario'] == scenario and r['load'] == load_]
    return fmt([pick(r) for r in g])


def not_supported(rows, deck, scenario):
    # #294, #266 rule 11: a deck that never responded to a scenario's own
    # gesture (`responded`, false in more than half of its reps for that
    # scenario) cannot win or tie it.
    vals = [r.get('responded') for r in rows if r['deck'] == deck and r['scenario'] == scenario]
    vals = [v for v in vals if v is not None]
    if not vals:
        return False
    return sum(1 for v in vals if v is False) > len(vals) / 2


def did_not_close(rows, deck, scenario):
    # #311, #266 rule 12: a dismiss only counts once the library itself
    # reports closed (`closed`, from `window.__bench.isOpen()`, never this
    # bench's own reading of the drawer's on-screen position). A deck that
    # never reports closed in more than half of its reps for a `dismiss`
    # scenario cannot win or tie it either -- the same majority rule as
    # rule 11's "not supported". `closed` is `None` for every scenario
    # that isn't `dismiss`.
    vals = [r.get('closed') for r in rows if r['deck'] == deck and r['scenario'] == scenario]
    vals = [v for v in vals if v is not None]
    if not vals:
        return False
    return sum(1 for v in vals if v is False) > len(vals) / 2


def table(rows, scenario, pick, digits=0, legacy_pick=None):
    # `legacy_pick` (#266 rule 10) adds an "unscoped (legacy)" column per
    # load: the same trace, scored the old way (one window spanning the
    # whole trace, idle time between gestures included), so the fix is
    # visible rather than swapping numbers quietly.
    load_cols = [f'load={load_}' for load_ in LOADS]
    if legacy_pick is not None:
        load_cols += [f'load={load_} unscoped (legacy)' for load_ in LOADS]
    lines = ['| Deck | ' + ' | '.join(load_cols) + ' |', '| --- | ' + ' | '.join('---' for _ in load_cols) + ' |']
    unsupported = []
    not_closed = []
    for deck in DECKS:
        if not_supported(rows, deck, scenario):
            unsupported.append(deck)
            cells = ['not supported'] * len(load_cols)
            lines.append(f'| {deck} | ' + ' | '.join(cells) + ' |')
            continue
        if did_not_close(rows, deck, scenario):
            not_closed.append(deck)
            cells = ['did not close'] * len(load_cols)
            lines.append(f'| {deck} | ' + ' | '.join(cells) + ' |')
            continue
        cells = [cell(rows, deck, scenario, load_, pick) for load_ in LOADS]
        if legacy_pick is not None:
            cells += [cell(rows, deck, scenario, load_, legacy_pick) for load_ in LOADS]
        lines.append(f'| {deck} | ' + ' | '.join(cells) + ' |')
    if unsupported:
        lines.append('')
        lines.append(
            f"Not supported: {', '.join(unsupported)} did not respond to this "
            'gesture in most of its reps (#294, #266 rule 11).'
        )
    if not_closed:
        lines.append('')
        lines.append(
            f"Did not close: {', '.join(not_closed)} never reported itself "
            'closed in most of its reps (#311, #266 rule 12).'
        )
    return '\n'.join(lines)


if __name__ == '__main__':
    base = sys.argv[1] if len(sys.argv) > 1 else 'results'
    rows = load(f'{base}/chromium.jsonl')
    print(f'rows: {len(rows)}')

    print('\n### touch-drag-half-full-back: longest stall (ms)\n')
    print(table(
        rows, 'touch-drag-half-full-back',
        lambda r: r['trace']['longestStallMs'] if r['trace'] else None, 1,
        legacy_pick=lambda r: r['trace']['legacy']['longestStallMs'] if r['trace'] else None,
    ))

    print('\n### touch-drag-half-full-back: dropped frames (%)\n')
    print(table(
        rows, 'touch-drag-half-full-back',
        lambda r: r['trace']['droppedPct'] if r['trace'] else None, 1,
        legacy_pick=lambda r: r['trace']['legacy']['droppedPct'] if r['trace'] else None,
    ))

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
