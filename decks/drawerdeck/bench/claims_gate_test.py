#!/usr/bin/env python3
# Unit tests for claims_gate.py (#276): synthetic rows and a tiny claims
# list, no browser or CI artifact involved. Run with
# `python3 claims_gate_test.py`.

import unittest

from aggregate import drawerdeck_verdict, excluded_decks
from claims_gate import evaluate


def row(deck, scenario, load_, settle_ms, responded=True, shard='1', closed=None):
    return {
        'deck': deck,
        'scenario': scenario,
        'load': load_,
        'settleMs': settle_ms,
        'responded': responded,
        'closed': closed,
        'shard': shard,
    }


def drag_row(deck, load_, longest_stall_ms, dropped_pct, shard='1'):
    return {
        'deck': deck,
        'scenario': 'touch-drag-half-full-back',
        'load': load_,
        'responded': True,
        'closed': None,
        'shard': shard,
        'trace': {'longestStallMs': longest_stall_ms, 'droppedPct': dropped_pct},
    }


WIN_CLAIM = {
    'label': 'Mouse throw: settle time, no load',
    'scenario': 'mouse-drag-throw',
    'metric': 'settleMs',
    'load': 0,
    'claim': 'win',
}

TIE_OR_BETTER_CLAIM = {
    'label': 'Longest stall while dragging, no load',
    'scenario': 'touch-drag-half-full-back',
    'metric': 'longestStallMs',
    'load': 0,
    'claim': 'tie_or_better',
}

BUNDLE_CLAIM = {
    'label': 'Bundle size (min+gzip, React external)',
    'scenario': 'bundle-size',
    'metric': 'bytes',
    'load': None,
    'claim': 'win',
}


def mouse_throw_rows(drawerdeck_ms, vaul_ms, baseui_ms, n=6, shards=('1', '2', '3')):
    rows = []
    for shard in shards:
        rows += [
            row('drawerdeck', 'mouse-drag-throw', 0, drawerdeck_ms, shard=shard)
            for _ in range(n)
        ]
        rows += [row('vaul', 'mouse-drag-throw', 0, vaul_ms, shard=shard) for _ in range(n)]
        rows += [
            row('baseui', 'mouse-drag-throw', 0, baseui_ms, shard=shard) for _ in range(n)
        ]
    return rows


class AllClaimsHoldTest(unittest.TestCase):
    def test_a_clear_win_passes(self):
        # drawerdeck's median (300ms) beats vaul's and Base UI's by far more
        # than its own spread (0ms, every shard reads the same number), and
        # every shard agrees: an outright win.
        rows = mouse_throw_rows(300, 900, 950)
        verdicts = evaluate(rows, [], [WIN_CLAIM])
        self.assertEqual(verdicts[0].actual, 'win')
        self.assertTrue(verdicts[0].ok)

    def test_a_tie_passes_a_tie_or_better_claim(self):
        # Shards disagree on the stall's winner, and drawerdeck itself
        # wins one of them, so aggregate.py's own drawerdeck_verdict
        # reports "tie" (#280's revised bar) -- which a "tie_or_better"
        # claim accepts.
        rows = [
            drag_row('drawerdeck', 0, 34.0, 0.0, shard='1'),
            drag_row('reactaria', 0, 34.1, 0.0, shard='1'),
            drag_row('drawerdeck', 0, 34.0, 0.0, shard='2'),
            drag_row('reactaria', 0, 33.9, 0.0, shard='2'),
        ]
        verdicts = evaluate(rows, [], [TIE_OR_BETTER_CLAIM])
        self.assertEqual(verdicts[0].actual, 'tie')
        self.assertTrue(verdicts[0].ok)

    def test_bundle_size_win_passes(self):
        bundle_rows = [
            {'deck': 'drawerdeck', 'bytes': 9200},
            {'deck': 'vaul', 'bytes': 23100},
            {'deck': 'baseui', 'bytes': 31700},
        ]
        verdicts = evaluate([], bundle_rows, [BUNDLE_CLAIM])
        self.assertEqual(verdicts[0].actual, 'win')
        self.assertTrue(verdicts[0].ok)

    def test_every_claim_in_a_mixed_list_can_hold_at_once(self):
        rows = mouse_throw_rows(300, 900, 950) + [
            drag_row('drawerdeck', 0, 34.0, 0.0, shard='1'),
            drag_row('reactaria', 0, 34.1, 0.0, shard='1'),
            drag_row('drawerdeck', 0, 34.0, 0.0, shard='2'),
            drag_row('reactaria', 0, 33.9, 0.0, shard='2'),
        ]
        bundle_rows = [{'deck': 'drawerdeck', 'bytes': 9200}, {'deck': 'vaul', 'bytes': 23100}]
        verdicts = evaluate(rows, bundle_rows, [WIN_CLAIM, TIE_OR_BETTER_CLAIM, BUNDLE_CLAIM])
        self.assertTrue(all(v.ok for v in verdicts))


class ClaimedWinBecomesATieTest(unittest.TestCase):
    def test_a_claimed_win_that_regresses_to_a_tie_fails_named(self):
        # drawerdeck's own spread across shards (850-950) now swallows its
        # gap to vaul's median (905), and the shards no longer all pick the
        # same winner: cell_winner reports "tie", which a "win" claim must
        # reject, named in the verdict.
        rows = []
        for shard, drawerdeck_ms in zip(('1', '2', '3'), (850, 900, 950)):
            rows += [row('drawerdeck', 'mouse-drag-throw', 0, drawerdeck_ms, shard=shard)]
            rows += [row('vaul', 'mouse-drag-throw', 0, 905, shard=shard)]
        verdicts = evaluate(rows, [], [WIN_CLAIM])
        self.assertEqual(verdicts[0].actual, 'tie')
        self.assertFalse(verdicts[0].ok)
        self.assertEqual(verdicts[0].claim['label'], WIN_CLAIM['label'])


class TieOrBetterBecomesALossTest(unittest.TestCase):
    def test_a_claimed_tie_or_better_that_loses_outright_fails(self):
        # Every shard agrees vaul is now clearly faster than drawerdeck, by
        # more than drawerdeck's own spread: an outright loss.
        rows = []
        for shard in ('1', '2', '3'):
            rows.append(drag_row('drawerdeck', 0, 300.0, 0.0, shard=shard))
            rows.append(drag_row('vaul', 0, 40.0, 0.0, shard=shard))
        verdicts = evaluate(rows, [], [TIE_OR_BETTER_CLAIM])
        self.assertEqual(verdicts[0].actual, 'vaul')
        self.assertFalse(verdicts[0].ok)


class ClaimMissingFromTheRunTest(unittest.TestCase):
    def test_a_claim_with_no_matching_rows_at_all_fails(self):
        verdicts = evaluate([], [], [WIN_CLAIM])
        self.assertEqual(verdicts[0].actual, 'missing')
        self.assertFalse(verdicts[0].ok)

    def test_a_bundle_claim_with_no_bundle_rows_fails(self):
        verdicts = evaluate([], [], [BUNDLE_CLAIM])
        self.assertEqual(verdicts[0].actual, 'missing')
        self.assertFalse(verdicts[0].ok)

    def test_a_claim_naming_a_metric_the_run_never_scored_fails(self):
        unknown = {**WIN_CLAIM, 'metric': 'notARealMetric'}
        rows = mouse_throw_rows(300, 900, 950)
        verdicts = evaluate(rows, [], [unknown])
        self.assertEqual(verdicts[0].actual, 'unknown metric')
        self.assertFalse(verdicts[0].ok)


def settle_pick(r):
    return r['settleMs']


class DrawerdeckVerdictTest(unittest.TestCase):
    # aggregate.py's own drawerdeck_verdict, exercised directly (#348's
    # review of #276): cell_winner's generic Overall can read "tie" while
    # drawerdeck itself is simply behind, so this is the rule every
    # drawerdeck claim -- the page and the gate alike -- is now judged
    # against.

    def test_two_rivals_tie_and_drawerdeck_loses_is_a_loss(self):
        # vaul and baseui swap first and second place shard by shard (a
        # real tie between the two rivals), but drawerdeck trails both of
        # them by far more than either rival's own spread, on every
        # shard. A generic Overall would read "tie" here (the shards
        # disagree, just not about drawerdeck); drawerdeck's own verdict
        # must not let that hide an outright loss.
        rows = [
            row('vaul', 'mouse-drag-throw', 0, 100, shard='1'),
            row('baseui', 'mouse-drag-throw', 0, 102, shard='1'),
            row('drawerdeck', 'mouse-drag-throw', 0, 300, shard='1'),
            row('vaul', 'mouse-drag-throw', 0, 102, shard='2'),
            row('baseui', 'mouse-drag-throw', 0, 100, shard='2'),
            row('drawerdeck', 'mouse-drag-throw', 0, 300, shard='2'),
            row('vaul', 'mouse-drag-throw', 0, 101, shard='3'),
            row('baseui', 'mouse-drag-throw', 0, 100.9, shard='3'),
            row('drawerdeck', 'mouse-drag-throw', 0, 300, shard='3'),
        ]
        excluded = excluded_decks(rows, 'mouse-drag-throw', 0)
        verdict, leader = drawerdeck_verdict(
            rows, 'mouse-drag-throw', 0, settle_pick, True, excluded
        )
        self.assertEqual(verdict, 'loss')
        self.assertEqual(leader, 'baseui')

    def test_drawerdeck_within_the_leading_deck_s_spread_is_a_tie(self):
        # vaul alone leads every shard, but drawerdeck's own gap to
        # vaul's pooled median (6ms) sits inside vaul's own spread across
        # shards (10ms) -- the same margin rule 7 would call noise for
        # any other deck.
        rows = [
            row('vaul', 'open-to-half', 0, 95, shard='1'),
            row('drawerdeck', 'open-to-half', 0, 106, shard='1'),
            row('vaul', 'open-to-half', 0, 100, shard='2'),
            row('drawerdeck', 'open-to-half', 0, 106, shard='2'),
            row('vaul', 'open-to-half', 0, 105, shard='3'),
            row('drawerdeck', 'open-to-half', 0, 106, shard='3'),
        ]
        excluded = excluded_decks(rows, 'open-to-half', 0)
        verdict, leader = drawerdeck_verdict(rows, 'open-to-half', 0, settle_pick, True, excluded)
        self.assertEqual(verdict, 'tie')
        self.assertEqual(leader, 'vaul')

    def test_drawerdeck_winning_one_shard_outright_is_a_tie(self):
        # drawerdeck's pooled median (90) trails vaul's (60) by far more
        # than vaul's own spread (1ms) -- not within-spread noise -- but
        # drawerdeck's own rows won shard 2 outright, firsthand evidence
        # it isn't simply behind (#280's revised bar).
        rows = [
            row('vaul', 'mouse-drag-throw', 0, 60, shard='1'),
            row('drawerdeck', 'mouse-drag-throw', 0, 90, shard='1'),
            row('vaul', 'mouse-drag-throw', 0, 60, shard='2'),
            row('drawerdeck', 'mouse-drag-throw', 0, 55, shard='2'),
            row('vaul', 'mouse-drag-throw', 0, 61, shard='3'),
            row('drawerdeck', 'mouse-drag-throw', 0, 90, shard='3'),
        ]
        excluded = excluded_decks(rows, 'mouse-drag-throw', 0)
        verdict, leader = drawerdeck_verdict(
            rows, 'mouse-drag-throw', 0, settle_pick, True, excluded
        )
        self.assertEqual(verdict, 'tie')
        self.assertEqual(leader, 'vaul')


if __name__ == '__main__':
    unittest.main()
