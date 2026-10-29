#!/usr/bin/env python3
# Multi-shard aggregation for .github/workflows/drawer-bench.yml's `report`
# job (#266). Pools every shard's chromium.jsonl rows into one set of
# medians/spread/n per (deck, scenario, load) cell, and separately computes
# a per-shard winner for each cell -- the winning deck inside that shard's
# own rows only -- so a reader can see whether the six shards agree before
# trusting the pooled number. A cell's overall winner is "tie" when the
# shards disagree with each other, or when the gap between the best and
# second-best pooled medians is no larger than the best deck's own spread
# across all shards (the margin could be noise).
#
# Usage:
#   python3 aggregate.py <shards-dir> --bundle <bundle-size.json> \
#     --out-md <RESULTS.md> --out-jsonl <aggregate.jsonl> \
#     --out-summary <at-a-glance.md>
#
# <shards-dir> holds one subdirectory per shard artifact
# (drawer-bench-shard-<n>/chromium.jsonl, as uploaded by the `bench` job).

import argparse
import glob
import json
import os
import statistics as st
from collections import defaultdict

DECKS = ['drawerdeck', 'vaul', 'baseui', 'reactaria']
LOADS = [0, 100, 200]
VERSIONS_PATH = os.path.join(os.path.dirname(__file__), 'versions.json')

# (scenario, metric key, label, lower-is-better, extractor, legacy extractor)
#
# The legacy extractor (#266 rule 10) is only set for the two metrics
# `trace.ts`'s scorer restricts to active windows: it reads the same trace,
# scored the old way (one window spanning the whole trace, idle time
# between gestures included), so `render_tables` can print it in a
# clearly-labelled "unscoped (legacy)" column rather than swapping numbers
# quietly. It never feeds a winner: `cell_winner` only ever sees `pick`.
METRICS = [
    (
        'touch-drag-half-full-back',
        'longestStallMs',
        'Touch drag half->full->back: longest stall (ms)',
        True,
        lambda r: r['trace']['longestStallMs'] if r.get('trace') else None,
        lambda r: r['trace']['legacy']['longestStallMs'] if r.get('trace') else None,
    ),
    (
        'touch-drag-half-full-back',
        'droppedPct',
        'Touch drag half->full->back: dropped frames (%)',
        True,
        lambda r: r['trace']['droppedPct'] if r.get('trace') else None,
        lambda r: r['trace']['legacy']['droppedPct'] if r.get('trace') else None,
    ),
    (
        'touch-flick-dismiss',
        'settleMs',
        'Touch flick dismiss: settle time (ms)',
        True,
        lambda r: r['settleMs'],
        None,
    ),
    (
        'mouse-drag-throw',
        'settleMs',
        'Mouse drag and release, upward throw: settle time (ms)',
        True,
        lambda r: r['settleMs'],
        None,
    ),
    (
        'open-to-half',
        'settleMs',
        'Open to settled half: settle time (ms)',
        True,
        lambda r: r['settleMs'],
        None,
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


def not_supported(rows, deck, scenario):
    # #294, #266 rule 11: a deck that never responded to a scenario's own
    # gesture -- bench.spec.ts's `responded`, false in most (more than
    # half) of its scored reps for that scenario, across every load --
    # cannot win or tie it. One rep timing out never flips this; a deck
    # that consistently ignores the gesture does.
    vals = [
        r.get('responded')
        for r in rows
        if r['deck'] == deck and r['scenario'] == scenario
    ]
    vals = [v for v in vals if v is not None]
    if not vals:
        return False
    not_responded = sum(1 for v in vals if v is False)
    return not_responded > len(vals) / 2


def unsupported_decks(rows, scenario):
    return {deck for deck in DECKS if not_supported(rows, deck, scenario)}


def medians(rows, scenario, load_, pick):
    out = {}
    for deck in DECKS:
        vals = [
            pick(r)
            for r in rows
            if r['deck'] == deck and r['scenario'] == scenario and r['load'] == load_
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


def cell_winner(rows, scenario, load_, pick, lower_is_better, unsupported):
    # #294, #266 rule 11: a deck that didn't respond to this scenario's
    # gesture never enters the race for its winner or its ties.
    pooled = {
        d: v for d, v in medians(rows, scenario, load_, pick).items() if d not in unsupported
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
            for d, v in medians(shard_rows, scenario, load_, pick).items()
            if d not in unsupported
        }
        shard_best, _, _ = winner_of(shard_pooled, lower_is_better)
        per_shard_winner[shard] = shard_best

    distinct = {w for w in per_shard_winner.values() if w is not None}
    disagree = len(distinct) > 1
    tie = disagree or (gap is not None and gap <= spread)
    return ('tie' if tie else best_deck), per_shard_winner


def render_tables(rows):
    lines = []
    for scenario, _metric, label, _lower, pick, legacy_pick in METRICS:
        lines.append(f'\n### {label}\n')
        load_cols = [f'load={load_}' for load_ in LOADS]
        if legacy_pick is not None:
            load_cols += [f'load={load_} unscoped (legacy)' for load_ in LOADS]
        lines.append('| Deck | ' + ' | '.join(load_cols) + ' |')
        lines.append('| --- | ' + ' | '.join('---' for _ in load_cols) + ' |')
        unsupported = unsupported_decks(rows, scenario)
        for deck in DECKS:
            if deck in unsupported:
                cells = ['not supported'] * len(load_cols)
                lines.append(f'| {deck} | ' + ' | '.join(cells) + ' |')
                continue

            def vals_for(pick_fn, load_):
                vs = [
                    pick_fn(r)
                    for r in rows
                    if r['deck'] == deck and r['scenario'] == scenario and r['load'] == load_
                ]
                return [v for v in vs if v is not None]

            cells = [fmt_cell(vals_for(pick, load_)) for load_ in LOADS]
            if legacy_pick is not None:
                cells += [fmt_cell(vals_for(legacy_pick, load_)) for load_ in LOADS]
            lines.append(f'| {deck} | ' + ' | '.join(cells) + ' |')
        if unsupported:
            names = ', '.join(sorted(unsupported))
            lines.append(
                f'\n**Not supported:** {names} did not respond to this gesture in '
                'most of its reps (#294, #266 rule 11); excluded from its winners '
                'and ties.\n'
            )
    return '\n'.join(lines)


def render_winner_table(rows):
    shard_ids = shards_of(rows)
    lines = [
        '\n### Per-shard winners\n',
        '"tie" means the shards disagreed on a winner, or the gap between the',
        'best and second-best pooled medians was no larger than the winning',
        "deck's own spread across shards.\n",
        '| Scenario / metric | load | ' + ' | '.join(f'shard {s}' for s in shard_ids) + ' | Overall |',
        '| --- | --- | ' + ' | '.join('---' for _ in shard_ids) + ' | --- |',
    ]
    for scenario, _metric, label, lower, pick, _legacy_pick in METRICS:
        unsupported = unsupported_decks(rows, scenario)
        for load_ in LOADS:
            overall, per_shard = cell_winner(rows, scenario, load_, pick, lower, unsupported)
            shard_cells = [str(per_shard.get(s, 'n/a')) for s in shard_ids]
            lines.append(
                f'| {label} | {load_} | ' + ' | '.join(shard_cells) + f' | {overall} |'
            )
    return '\n'.join(lines)


def render_summary(rows, bundle_rows):
    lines = ['| Scenario / metric | load | Winner |', '| --- | --- | --- |']
    for scenario, _metric, label, lower, pick, _legacy_pick in METRICS:
        unsupported = unsupported_decks(rows, scenario)
        for load_ in LOADS:
            overall, _ = cell_winner(rows, scenario, load_, pick, lower, unsupported)
            lines.append(f'| {label} | {load_} | {overall} |')
    if bundle_rows:
        smallest = min(bundle_rows, key=lambda r: r['bytes'])
        lines.append(
            f"| Bundle size (min+gzip, React external) | - | {smallest['deck']} |"
        )
    return '\n'.join(lines)


def render_versions(versions):
    # Rule 5: each rival's pinned version with its npm release date, read
    # from the checked-in versions.json rather than hitting npm from CI.
    lines = ['\n### Versions\n', '| Deck | Version | Released |', '| --- | --- | --- |']
    lines.append('| drawerdeck | this commit (`workspace:*`, unreleased) | - |')
    for deck in ('vaul', 'baseui', 'reactaria'):
        v = versions[deck]
        lines.append(f"| {deck} | {v['npm']}@{v['version']} | {v['releaseDate']} |")
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
    md.append('# Drawer bench: results (#266, #283)\n')
    md.append(
        f'Pooled from {len(shard_ids)} shard(s) ({", ".join(shard_ids)}), '
        f'{len(rows)} scored rows total (the warm-up rep each page ran '
        'first, per rule 6, is excluded here). Generated by the `report` '
        'job in `.github/workflows/drawer-bench.yml`; not checked into the '
        'repo.\n'
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
