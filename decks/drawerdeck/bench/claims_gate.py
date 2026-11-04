#!/usr/bin/env python3
# Gates drawerdeck's public comparison-page claims (#276) against one bench
# run. `claims.json` is the one machine-readable list of what the page
# claims, one entry per (scenario, metric, load) cell plus bundle size; a
# test in sites/drawerdeck/src keeps that file and compare.md's "At a
# glance" table in agreement. This script re-derives each claimed cell's
# Overall verdict the same way aggregate.py's own render_summary/
# render_winner_table do -- `cell_winner` and `excluded_decks`, imported
# from aggregate.py directly, never a second copy of the winner/tie rule --
# and fails when a claimed "win" isn't an outright win, or a claimed
# "tie or better" (#139: within one frame, a tie counts as 0, i.e. met)
# comes back a clear loss.
#
# Usage:
#   python3 claims_gate.py <aggregate.jsonl> --bundle <bundle-size.json> \
#     --claims claims.json --out-md <gate.md> --out-json <gate.json>
#
# Exits 1, after writing both outputs, if any claim broke.

import argparse
import json
import sys
from collections import namedtuple

from aggregate import METRICS, cell_winner, excluded_decks

Verdict = namedtuple('Verdict', ['claim', 'actual', 'ok'])


def metric_lookup():
    return {
        (scenario, metric): (pick, lower)
        for scenario, metric, _label, lower, pick, _legacy in METRICS
    }


def load_jsonl(path):
    rows = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def load_bundle(path):
    if not path:
        return []
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return []


def load_claims(path):
    with open(path) as f:
        return json.load(f)


def actual_for_bundle(bundle_rows):
    if not bundle_rows:
        return 'missing'
    smallest = min(bundle_rows, key=lambda r: r['bytes'])
    return 'win' if smallest['deck'] == 'drawerdeck' else smallest['deck']


def actual_for_cell(rows, claim, lookup):
    key = (claim['scenario'], claim['metric'])
    if key not in lookup:
        return 'unknown metric'
    pick, lower = lookup[key]
    excluded = excluded_decks(rows, claim['scenario'], claim['load'])
    winner, _ = cell_winner(rows, claim['scenario'], claim['load'], pick, lower, excluded)
    if winner == 'drawerdeck':
        return 'win'
    if winner == 'tie':
        return 'tie'
    if winner in (None, 'n/a'):
        return 'missing'
    return winner  # another deck's name: a clear loss


def meets(claim_kind, actual):
    if claim_kind == 'win':
        return actual == 'win'
    if claim_kind == 'tie_or_better':
        return actual in ('win', 'tie')
    return False


def evaluate(rows, bundle_rows, claims):
    lookup = metric_lookup()
    verdicts = []
    for claim in claims:
        if claim['scenario'] == 'bundle-size':
            actual = actual_for_bundle(bundle_rows)
        else:
            actual = actual_for_cell(rows, claim, lookup)
        verdicts.append(Verdict(claim, actual, meets(claim['claim'], actual)))
    return verdicts


def render_md(verdicts):
    lines = [
        '# Drawerdeck claims gate (#276)\n',
        'Checks every claim in `claims.json` against this run\'s own '
        'Overall verdict (the same `cell_winner`/`excluded_decks` rules '
        '`aggregate.py` uses for the comparison page -- no second rule '
        'here).\n',
        '| Claim | Claimed | Found | Result |',
        '| --- | --- | --- | --- |',
    ]
    for v in verdicts:
        mark = 'PASS' if v.ok else 'FAIL'
        lines.append(f"| {v.claim['label']} | {v.claim['claim']} | {v.actual} | {mark} |")
    broken = [v for v in verdicts if not v.ok]
    if broken:
        lines.append('\n## Broken claims\n')
        for v in broken:
            lines.append(
                f"- **{v.claim['label']}**: claimed `{v.claim['claim']}`, found `{v.actual}`"
            )
    else:
        lines.append('\nEvery claim holds.\n')
    return '\n'.join(lines) + '\n'


def render_json(verdicts):
    return {
        'ok': all(v.ok for v in verdicts),
        'claims': [
            {**v.claim, 'actual': v.actual, 'ok': v.ok} for v in verdicts
        ],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('aggregate_jsonl')
    parser.add_argument('--bundle', default=None)
    parser.add_argument('--claims', required=True)
    parser.add_argument('--out-md', required=True)
    parser.add_argument('--out-json', required=True)
    args = parser.parse_args()

    rows = load_jsonl(args.aggregate_jsonl)
    bundle_rows = load_bundle(args.bundle)
    claims = load_claims(args.claims)

    verdicts = evaluate(rows, bundle_rows, claims)

    with open(args.out_md, 'w') as f:
        f.write(render_md(verdicts))
    result = render_json(verdicts)
    with open(args.out_json, 'w') as f:
        json.dump(result, f, indent=2)
        f.write('\n')

    broken = [v for v in verdicts if not v.ok]
    if broken:
        print(f'{len(broken)} of {len(verdicts)} claim(s) broken:')
        for v in broken:
            print(f"  - {v.claim['label']}: claimed {v.claim['claim']}, found {v.actual}")
        sys.exit(1)
    print(f'All {len(verdicts)} claims hold.')


if __name__ == '__main__':
    main()
