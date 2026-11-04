#!/usr/bin/env python3
# Multi-shard aggregation for the carousel bench's own report job (#340,
# ported from decks/drawerdeck/bench/aggregate.py, #266/#283). Pools every
# shard's chromium.jsonl rows into one set of medians/spread/n per (deck,
# scenario, load, loop) cell, and separately computes a per-shard winner for
# each cell -- the winning deck inside that shard's own rows only -- so a
# reader can see whether the shards agree before trusting the pooled number.
# A cell's overall winner is "tie" when the shards disagree with each other,
# or when the gap between the best and second-best pooled medians is no
# larger than the best deck's own spread across all shards (the margin
# could be noise).
#
# Usage:
#   python3 aggregate.py <shards-dir> --bundle <bundle-size.json> \
#     --out-md <RESULTS.md> --out-jsonl <aggregate.jsonl> \
#     --out-summary <at-a-glance.md>
#
# <shards-dir> holds one subdirectory per shard artifact
# (carousel-bench-shard-<n>/chromium.jsonl, as uploaded by the `bench` job).
#
# Unlike drawerdeck's bench, a carousel has no open/close concept, so there
# is no "did not close" rule (drawerdeck's #266 rule 12) here, and no
# "unscoped (legacy)" columns: every scenario here opens exactly one active
# window per rep, so `trace.ts`'s `analyzeMotion` has nothing for a legacy
# column to show differently (see its own header comment). Fairness rule 11
# ("a deck that does not respond to a gesture cannot win it") is the only
# exclusion, scoped to `(deck, scenario, load, loop)`.

import argparse
import glob
import json
import os
import statistics as st
from collections import defaultdict

DECKS = ['carouseldeck', 'embla', 'keen', 'swiper', 'splide']
LOADS = [0, 100, 200]
LOOPS = [False, True]
VERSIONS_PATH = os.path.join(os.path.dirname(__file__), 'versions.json')

# (scenario, metric key, label, lower-is-better, extractor)
#
# `touch-swipe-next` and `touch-flick-three` are the two CDP-touch,
# `chromiumOnly` scenarios (scenarios.ts): each gets the trace-scored
# longest-stall/dropped-frames pair plus a plain settle time, the same dual
# treatment drawerdeck's bench gave its own touch scenario. The other three
# scenarios (no trusted touch needed) get a settle time only.
METRICS = [
    (
        'touch-swipe-next',
        'longestStallMs',
        'Touch swipe to next slide: longest stall (ms)',
        True,
        lambda r: r['trace']['longestStallMs'] if r.get('trace') else None,
    ),
    (
        'touch-swipe-next',
        'droppedPct',
        'Touch swipe to next slide: dropped frames (%)',
        True,
        lambda r: r['trace']['droppedPct'] if r.get('trace') else None,
    ),
    (
        'touch-swipe-next',
        'settleMs',
        'Touch swipe to next slide: settle time (ms)',
        True,
        lambda r: r['settleMs'],
    ),
    (
        'touch-flick-three',
        'longestStallMs',
        'Touch flick three slides: longest stall (ms)',
        True,
        lambda r: r['trace']['longestStallMs'] if r.get('trace') else None,
    ),
    (
        'touch-flick-three',
        'droppedPct',
        'Touch flick three slides: dropped frames (%)',
        True,
        lambda r: r['trace']['droppedPct'] if r.get('trace') else None,
    ),
    (
        'touch-flick-three',
        'settleMs',
        'Touch flick three slides: settle time (ms)',
        True,
        lambda r: r['settleMs'],
    ),
    (
        'mouse-drag-release',
        'settleMs',
        'Mouse drag and release: settle time (ms)',
        True,
        lambda r: r['settleMs'],
    ),
    (
        'wheel-scroll-next',
        'settleMs',
        'Wheel scroll to next slide: settle time (ms)',
        True,
        lambda r: r['settleMs'],
    ),
    (
        'next-button',
        'settleMs',
        'Next button click: settle time (ms)',
        True,
        lambda r: r['settleMs'],
    ),
]


def load_rows(shards_dir):
    rows = []
    for path in sorted(glob.glob(f'{shards_dir}/*/chromium.jsonl')):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
    # Rule 6's warm-up rep, discarded (bench.spec.ts): scored and reported
    # here, but never counted toward a median, spread or winner.
    return [r for r in rows if not r.get('warmup')]


def load_versions():
    with open(VERSIONS_PATH) as f:
        return json.load(f)


def shards_of(rows):
    return sorted({str(r.get('shard', 'local')) for r in rows})


def not_supported(rows, deck, scenario, load_, loop_):
    # Fairness rule 11 (carried from drawerdeck's bench): a deck that never
    # responded to a scenario's own gesture -- bench.spec.ts's `responded`,
    # false in most (more than half) of its scored reps for that scenario
    # at that (load, loop) -- cannot win or tie it there. Scoped per load
    # *and* loop, the same as every other cell here (`medians`,
    # `cell_winner`): a deck can respond with loop off and not with loop
    # on (or vice versa), so pooling across either axis would let one
    # cell's majority decide another cell's result (the same reasoning
    # drawerdeck's #314 fix gave load alone). One rep timing out never
    # flips this; a deck that consistently ignores the gesture does.
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
    not_responded = sum(1 for v in vals if v is False)
    return not_responded > len(vals) / 2


def unsupported_decks(rows, scenario, load_, loop_):
    return {deck for deck in DECKS if not_supported(rows, deck, scenario, load_, loop_)}


def excluded_decks(rows, scenario, load_, loop_):
    # No "did not close" rule here (#340): a carousel has no open/close
    # concept, so rule 11's "not supported" is the only exclusion a cell's
    # winner ever applies.
    return unsupported_decks(rows, scenario, load_, loop_)


def medians(rows, scenario, load_, loop_, pick):
    out = {}
    for deck in DECKS:
        vals = [
            pick(r)
            for r in rows
            if r['deck'] == deck
            and r['scenario'] == scenario
            and r['load'] == load_
            and r['loop'] == loop_
        ]
        vals = [v for v in vals if v is not None]
        out[deck] = vals
    return out


def fmt_cell(vals):
    if not vals:
        return 'n/a'
    med = st.median(vals)
    return f'{med:.1f} ({min(vals):.1f}-{max(vals):.1f}, n={len(vals)})'


def winner_of(vals_by_deck, lower_is_better):
    # Only decks with at least one value compete.
    candidates = [(d, st.median(v)) for d, v in vals_by_deck.items() if v]
    if len(candidates) < 2:
        return candidates[0][0] if candidates else None, None, None
    candidates.sort(key=lambda dv: dv[1], reverse=not lower_is_better)
    best_deck, best_med = candidates[0]
    _, second_med = candidates[1]
    gap = abs(second_med - best_med)
    return best_deck, gap, best_med


def cell_winner(rows, scenario, load_, loop_, pick, lower_is_better, excluded):
    # Fairness rule 11: a deck that didn't respond to this scenario's
    # gesture never enters the race for its winner or its ties.
    pooled = {
        d: v
        for d, v in medians(rows, scenario, load_, loop_, pick).items()
        if d not in excluded
    }
    best_deck, gap, _ = winner_of(pooled, lower_is_better)
    if best_deck is None:
        return 'n/a', {}
    best_vals = pooled[best_deck]
    spread = (max(best_vals) - min(best_vals)) if len(best_vals) > 1 else 0

    per_shard_winner = {}
    for shard in shards_of(rows):
        shard_rows = [r for r in rows if str(r.get('shard', 'local')) == shard]
        shard_pooled = {
            d: v
            for d, v in medians(shard_rows, scenario, load_, loop_, pick).items()
            if d not in excluded
        }
        shard_best, _, _ = winner_of(shard_pooled, lower_is_better)
        per_shard_winner[shard] = shard_best

    distinct = {w for w in per_shard_winner.values() if w is not None}
    disagree = len(distinct) > 1
    tie = disagree or (gap is not None and gap <= spread)
    return ('tie' if tie else best_deck), per_shard_winner


def render_tables(rows):
    lines = []
    cols = [(load_, loop_) for load_ in LOADS for loop_ in LOOPS]
    col_labels = [f'load={load_} loop={str(loop_).lower()}' for load_, loop_ in cols]
    for scenario, _metric, label, _lower, pick in METRICS:
        lines.append(f'\n### {label}\n')
        lines.append('| Deck | ' + ' | '.join(col_labels) + ' |')
        lines.append('| --- | ' + ' | '.join('---' for _ in cols) + ' |')
        # Per (deck, load, loop): a deck can be "not supported" at one
        # (load, loop) cell and fine at another, so the exclusion -- and
        # the cell it produces -- is decided for that cell alone, never
        # once for the whole row.
        unsupported_cells = defaultdict(list)
        for deck in DECKS:

            def vals_for(load_, loop_):
                vs = [
                    pick(r)
                    for r in rows
                    if r['deck'] == deck
                    and r['scenario'] == scenario
                    and r['load'] == load_
                    and r['loop'] == loop_
                ]
                return [v for v in vs if v is not None]

            cells = []
            for load_, loop_ in cols:
                if not_supported(rows, deck, scenario, load_, loop_):
                    unsupported_cells[deck].append((load_, loop_))
                    cells.append('not supported')
                else:
                    cells.append(fmt_cell(vals_for(load_, loop_)))
            lines.append(f'| {deck} | ' + ' | '.join(cells) + ' |')
        if unsupported_cells:
            parts = ', '.join(
                f"{deck} ("
                + ', '.join(f"load {l} loop {str(lp).lower()}" for l, lp in cells_)
                + ")"
                for deck, cells_ in sorted(unsupported_cells.items())
            )
            lines.append(
                f'\n**Not supported:** {parts} did not respond to this gesture in '
                'most of its reps at that cell (fairness rule 11); excluded from '
                'its winners and ties there.\n'
            )
    return '\n'.join(lines)


def render_winner_table(rows):
    shard_ids = shards_of(rows)
    lines = [
        '\n### Per-shard winners\n',
        '"tie" means the shards disagreed on a winner, or the gap between the',
        'best and second-best pooled medians was no larger than the winning',
        "deck's own spread across shards.\n",
        '| Scenario / metric | load | loop | '
        + ' | '.join(f'shard {s}' for s in shard_ids)
        + ' | Overall |',
        '| --- | --- | --- | ' + ' | '.join('---' for _ in shard_ids) + ' | --- |',
    ]
    for scenario, _metric, label, lower, pick in METRICS:
        for load_ in LOADS:
            for loop_ in LOOPS:
                excluded = excluded_decks(rows, scenario, load_, loop_)
                overall, per_shard = cell_winner(
                    rows, scenario, load_, loop_, pick, lower, excluded
                )
                shard_cells = [str(per_shard.get(s, 'n/a')) for s in shard_ids]
                lines.append(
                    f'| {label} | {load_} | {str(loop_).lower()} | '
                    + ' | '.join(shard_cells)
                    + f' | {overall} |'
                )
    return '\n'.join(lines)


def render_summary(rows, bundle_rows):
    lines = ['| Scenario / metric | load | loop | Winner |', '| --- | --- | --- | --- |']
    for scenario, _metric, label, lower, pick in METRICS:
        for load_ in LOADS:
            for loop_ in LOOPS:
                excluded = excluded_decks(rows, scenario, load_, loop_)
                overall, _ = cell_winner(rows, scenario, load_, loop_, pick, lower, excluded)
                lines.append(f'| {label} | {load_} | {str(loop_).lower()} | {overall} |')
    if bundle_rows:
        smallest = min(bundle_rows, key=lambda r: r['bytes'])
        lines.append(
            f"| Bundle size (min+gzip, React external) | - | - | {smallest['deck']} |"
        )
    return '\n'.join(lines)


def render_versions(versions):
    # Rule 5: each rival's pinned version with its npm release date, read
    # from the checked-in versions.json rather than hitting npm from CI.
    # embla and splide are each two packages (embla's own React hook plus
    # the Wheel Gestures plugin fairness rule 3 needs; splide's React
    # wrapper plus its core) -- each gets one row per package. keen and
    # swiper are one package each.
    lines = ['\n### Versions\n', '| Deck | Version | Released |', '| --- | --- | --- |']
    lines.append('| carouseldeck | this commit (`workspace:*`, unreleased) | - |')

    def row(label, v):
        return f"| {label} | {v['npm']}@{v['version']} | {v['releaseDate']} |"

    embla = versions['embla']
    lines.append(row('embla (react)', embla['react']))
    lines.append(row('embla (wheel gestures)', embla['wheelGestures']))
    for deck in ('keen', 'swiper'):
        lines.append(row(deck, versions[deck]))
    splide = versions['splide']
    lines.append(row('splide (react)', splide['react']))
    lines.append(row('splide (core)', splide['core']))
    return '\n'.join(lines)


def render_bundle_table(bundle_rows):
    if not bundle_rows:
        return ''
    lines = ['\n### Cost: bundle size (min+gzip, React external)\n', '| Deck | Size |', '| --- | --- |']
    for row in sorted(bundle_rows, key=lambda r: r['bytes']):
        lines.append(f"| {row['deck']} | {row['bytes'] / 1024:.2f} KB |")
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('shards_dir')
    parser.add_argument('--bundle', default=None)
    parser.add_argument('--out-md', required=True)
    parser.add_argument('--out-jsonl', required=True)
    parser.add_argument('--out-summary', required=True)
    args = parser.parse_args()

    rows = load_rows(args.shards_dir)
    bundle_rows = []
    if args.bundle:
        try:
            with open(args.bundle) as f:
                bundle_rows = json.load(f)
        except FileNotFoundError:
            pass

    shard_ids = shards_of(rows)
    with open(args.out_jsonl, 'w') as f:
        for row in rows:
            f.write(json.dumps(row) + '\n')

    md = []
    md.append('# Carousel bench: results (#340)\n')
    md.append(
        f'Pooled from {len(shard_ids)} shard(s) ({", ".join(shard_ids)}), '
        f'{len(rows)} scored rows total (the warm-up rep each page ran '
        'first, per rule 6, is excluded here). Generated by the `report` '
        'job in the carousel bench workflow; not checked into the repo.\n'
    )
    md.append(render_versions(load_versions()))
    md.append(render_tables(rows))
    md.append(render_bundle_table(bundle_rows))
    md.append(render_winner_table(rows))
    with open(args.out_md, 'w') as f:
        f.write('\n'.join(md) + '\n')

    with open(args.out_summary, 'w') as f:
        f.write(render_summary(rows, bundle_rows) + '\n')

    print(f'Wrote {args.out_md}, {args.out_jsonl}, {args.out_summary} from {len(rows)} rows.')


if __name__ == '__main__':
    main()
