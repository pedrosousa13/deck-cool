#!/usr/bin/env python3
# Multi-shard aggregation for .github/workflows/carousel-bench.yml's
# `report` job (#340), for the mount scenario's own rows
# (results/mount.jsonl, written by mount.spec.ts). Pools every shard's rows
# into medians/spread/n per (deck, n, dirty, mode) cell, for each of
# mount.spec.ts's own metrics, and separately computes a per-shard winner
# for each cell the same way aggregate.py does for the gesture scenarios
# (#266 rule 7): a winner needs every shard's own pooled winner to agree,
# and the gap between the best and second-best pooled medians to beat the
# winning deck's own spread across shards; otherwise the cell is a tie.
#
# Usage:
#   python3 aggregate-mount.py <shards-dir> \
#     --out-md <MOUNT-RESULTS.md> --out-jsonl <mount-aggregate.jsonl> \
#     --out-summary <mount-summary.md>
#
# <shards-dir> holds one subdirectory per mount shard artifact
# (carousel-mount-bench-shard-<n>/mount.jsonl, as uploaded by the
# `mount-bench` job).

import argparse
import glob
import json
import statistics as st

DECKS = ['carouseldeck', 'embla', 'keen', 'swiper', 'splide']
N_VALUES = [2, 20]
DIRTY = [False, True]
MODES = ['ssr', 'csr']

# (key, label, lower-is-better, extractor over `row['mount']`)
METRICS = [
    ('mountTaskMs', 'Main-thread busy time in the mount window (ms)', True, lambda m: m['mountTaskMs']),
    ('layoutCount', 'Layout trace events in the window (count)', True, lambda m: m['layoutCount']),
    ('layoutMs', 'Layout trace events in the window (ms)', True, lambda m: m['layoutMs']),
    ('styleRecalcCount', 'Style-recalc (UpdateLayoutTree) trace events (count)', True, lambda m: m['styleRecalcCount']),
    ('styleRecalcMs', 'Style-recalc (UpdateLayoutTree) trace events (ms)', True, lambda m: m['styleRecalcMs']),
    ('timeToPublishedFrameMs', 'Time to the first frame after every instance published (ms)', True, lambda m: m['timeToPublishedFrameMs']),
]


def load_rows(shards_dir):
    rows = []
    for path in sorted(glob.glob(f'{shards_dir}/*/mount.jsonl')):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line:
                    rows.append(json.loads(line))
    return [r for r in rows if not r.get('warmup')]


def shards_of(rows):
    return sorted({str(r.get('shard', 'local')) for r in rows})


def cell_values(rows, deck, n, dirty, mode, pick):
    g = [
        r for r in rows
        if r['deck'] == deck and r['n'] == n and r['dirty'] == dirty and r['mode'] == mode
    ]
    return [pick(r['mount']) for r in g if r.get('mount') is not None]


def fmt_cell(vals, digits):
    if not vals:
        return 'n/a'
    med = st.median(vals)
    return f'{med:.{digits}f} ({min(vals):.{digits}f}-{max(vals):.{digits}f}, n={len(vals)})'


def winner_of(vals_by_deck, lower_is_better):
    candidates = [(d, st.median(v)) for d, v in vals_by_deck.items() if v]
    if len(candidates) < 2:
        return (candidates[0][0] if candidates else None), None
    candidates.sort(key=lambda dv: dv[1], reverse=not lower_is_better)
    best_deck, best_med = candidates[0]
    _, second_med = candidates[1]
    return best_deck, abs(second_med - best_med)


def cell_winner(rows, n, dirty, mode, pick, lower_is_better):
    pooled = {d: cell_values(rows, d, n, dirty, mode, pick) for d in DECKS}
    best_deck, gap = winner_of(pooled, lower_is_better)
    if best_deck is None:
        return 'n/a', {}
    best_vals = pooled[best_deck]
    spread = (max(best_vals) - min(best_vals)) if len(best_vals) > 1 else 0

    per_shard_winner = {}
    for shard in shards_of(rows):
        shard_rows = [r for r in rows if str(r.get('shard', 'local')) == shard]
        shard_pooled = {d: cell_values(shard_rows, d, n, dirty, mode, pick) for d in DECKS}
        shard_best, _ = winner_of(shard_pooled, lower_is_better)
        per_shard_winner[shard] = shard_best

    distinct = {w for w in per_shard_winner.values() if w is not None}
    tie = len(distinct) > 1 or (gap is not None and gap <= spread)
    return ('tie' if tie else best_deck), per_shard_winner


def render_tables(rows, digits_by_key):
    lines = []
    for key, label, _lower, pick in METRICS:
        digits = digits_by_key[key]
        lines.append(f'\n### {label}\n')
        cols = [f'n={n} {"dirty" if dirty else "clean"} {mode}' for n in N_VALUES for dirty in DIRTY for mode in MODES]
        lines.append('| Deck | ' + ' | '.join(cols) + ' |')
        lines.append('| --- | ' + ' | '.join('---' for _ in cols) + ' |')
        for deck in DECKS:
            cells = [
                fmt_cell(cell_values(rows, deck, n, dirty, mode, pick), digits)
                for n in N_VALUES for dirty in DIRTY for mode in MODES
            ]
            lines.append(f'| {deck} | ' + ' | '.join(cells) + ' |')
    return '\n'.join(lines)


def render_winner_table(rows):
    shard_ids = shards_of(rows)
    lines = [
        '\n### Mount: per-shard winners\n',
        '| Metric | n | dirty | mode | ' + ' | '.join(f'shard {s}' for s in shard_ids) + ' | Overall |',
        '| --- | --- | --- | --- | ' + ' | '.join('---' for _ in shard_ids) + ' | --- |',
    ]
    for _key, label, lower, pick in METRICS:
        for n in N_VALUES:
            for dirty in DIRTY:
                for mode in MODES:
                    overall, per_shard = cell_winner(rows, n, dirty, mode, pick, lower)
                    shard_cells = [str(per_shard.get(s, 'n/a')) for s in shard_ids]
                    lines.append(
                        f"| {label} | {n} | {'dirty' if dirty else 'clean'} | {mode} | "
                        + ' | '.join(shard_cells) + f' | {overall} |'
                    )
    return '\n'.join(lines)


def render_summary(rows):
    lines = ['| Metric | n | dirty | mode | Winner |', '| --- | --- | --- | --- | --- |']
    for _key, label, lower, pick in METRICS:
        for n in N_VALUES:
            for dirty in DIRTY:
                for mode in MODES:
                    overall, _ = cell_winner(rows, n, dirty, mode, pick, lower)
                    lines.append(f"| {label} | {n} | {'dirty' if dirty else 'clean'} | {mode} | {overall} |")
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('shards_dir')
    parser.add_argument('--out-md', required=True)
    parser.add_argument('--out-jsonl', required=True)
    parser.add_argument('--out-summary', required=True)
    args = parser.parse_args()

    rows = load_rows(args.shards_dir)
    shard_ids = shards_of(rows)
    with open(args.out_jsonl, 'w') as f:
        for row in rows:
            f.write(json.dumps(row) + '\n')

    digits_by_key = {
        'mountTaskMs': 1,
        'layoutCount': 0,
        'layoutMs': 1,
        'styleRecalcCount': 0,
        'styleRecalcMs': 1,
        'timeToPublishedFrameMs': 1,
    }

    md = []
    md.append('# Carousel mount bench: results (#340)\n')
    md.append(
        f'Pooled from {len(shard_ids)} shard(s) ({", ".join(shard_ids)}), '
        f'{len(rows)} scored rows total (the warm-up rep each page ran '
        'first is excluded here). Generated by the `report` job in '
        '`.github/workflows/carousel-bench.yml`; not checked into the repo.\n'
    )
    md.append(render_tables(rows, digits_by_key))
    md.append(render_winner_table(rows))
    with open(args.out_md, 'w') as f:
        f.write('\n'.join(md) + '\n')

    with open(args.out_summary, 'w') as f:
        f.write(render_summary(rows) + '\n')

    print(f'Wrote {args.out_md}, {args.out_jsonl}, {args.out_summary} from {len(rows)} rows.')


if __name__ == '__main__':
    main()
