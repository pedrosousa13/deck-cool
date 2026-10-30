#!/usr/bin/env python3
# Unit tests for aggregate.py's "not supported" rule (#294, #266 rule 11)
# and its "did not close" rule (#311, #266 rule 12): a deck that didn't
# respond to a scenario's own gesture, or that never reported itself
# closed for a dismiss scenario, in most of its reps, cannot win or tie
# it. Synthetic rows, no browser or CI artifact involved. Run with
# `python3 aggregate_test.py`.

import unittest

from aggregate import (
    cell_winner,
    did_not_close,
    did_not_close_decks,
    excluded_decks,
    not_supported,
    unsupported_decks,
)


def row(deck, scenario, load_, settle_ms, responded, shard='1', closed=None):
    return {
        'deck': deck,
        'scenario': scenario,
        'load': load_,
        'settleMs': settle_ms,
        'responded': responded,
        'closed': closed,
        'shard': shard,
    }


def settle_pick(r):
    return r['settleMs']


class NotSupportedTest(unittest.TestCase):
    def test_deck_that_never_responds_is_not_supported(self):
        rows = [row('reactaria', 'mouse-drag-throw', 0, 262, False) for _ in range(5)]
        self.assertTrue(not_supported(rows, 'reactaria', 'mouse-drag-throw'))

    def test_deck_that_always_responds_is_supported(self):
        rows = [row('vaul', 'mouse-drag-throw', 0, 180, True) for _ in range(5)]
        self.assertFalse(not_supported(rows, 'vaul', 'mouse-drag-throw'))

    def test_majority_rule_a_minority_of_misses_does_not_flip_it(self):
        # 2 of 5 reps failed to register movement (e.g. a flaky rep) --
        # still a majority responded, so the deck is supported.
        rows = [row('vaul', 'mouse-drag-throw', 0, 180, True) for _ in range(3)] + [
            row('vaul', 'mouse-drag-throw', 0, 180, False) for _ in range(2)
        ]
        self.assertFalse(not_supported(rows, 'vaul', 'mouse-drag-throw'))

    def test_majority_rule_a_majority_of_misses_flips_it(self):
        rows = [row('vaul', 'mouse-drag-throw', 0, 180, True) for _ in range(2)] + [
            row('vaul', 'mouse-drag-throw', 0, 180, False) for _ in range(3)
        ]
        self.assertTrue(not_supported(rows, 'vaul', 'mouse-drag-throw'))

    def test_no_responded_field_at_all_is_supported(self):
        # Rows from before this field existed: never marked "not supported".
        rows = [{'deck': 'vaul', 'scenario': 'mouse-drag-throw', 'load': 0, 'settleMs': 180}]
        self.assertFalse(not_supported(rows, 'vaul', 'mouse-drag-throw'))

    def test_unsupported_decks_only_names_the_ones_that_dont_respond(self):
        rows = [row('reactaria', 'mouse-drag-throw', 0, 262, False) for _ in range(5)] + [
            row('vaul', 'mouse-drag-throw', 0, 180, True) for _ in range(5)
        ]
        self.assertEqual(unsupported_decks(rows, 'mouse-drag-throw'), {'reactaria'})

    def test_not_supported_is_scoped_to_its_own_scenario(self):
        # reactaria doesn't respond to the mouse throw, but does to the
        # click-driven open-to-half: being unsupported for one scenario
        # must not bleed into another.
        rows = [row('reactaria', 'mouse-drag-throw', 0, 262, False) for _ in range(5)] + [
            row('reactaria', 'open-to-half', 0, 150, True) for _ in range(5)
        ]
        self.assertTrue(not_supported(rows, 'reactaria', 'mouse-drag-throw'))
        self.assertFalse(not_supported(rows, 'reactaria', 'open-to-half'))


class CellWinnerExcludesUnsupportedTest(unittest.TestCase):
    def test_a_deck_that_never_responds_cannot_win_even_with_the_best_number(self):
        # reactaria's settle time (262ms, from timing out doing nothing) is
        # numerically the best in this synthetic set, but it never
        # responded, so drawerdeck -- slower, but real movement -- wins.
        rows = (
            [row('reactaria', 'mouse-drag-throw', 0, 262, False) for _ in range(5)]
            + [row('drawerdeck', 'mouse-drag-throw', 0, 300, True) for _ in range(5)]
            + [row('vaul', 'mouse-drag-throw', 0, 400, True) for _ in range(5)]
            + [row('baseui', 'mouse-drag-throw', 0, 450, True) for _ in range(5)]
        )
        unsupported = unsupported_decks(rows, 'mouse-drag-throw')
        winner, _ = cell_winner(rows, 'mouse-drag-throw', 0, settle_pick, True, unsupported)
        self.assertEqual(winner, 'drawerdeck')

    def test_a_deck_excluded_for_non_response_cannot_force_a_tie_either(self):
        # Without the exclusion, reactaria's 262ms would sit close enough to
        # drawerdeck's 270ms to call it a tie; excluded, drawerdeck's own
        # gap to the real second-best (vaul, 400ms) decides it outright.
        rows = (
            [row('reactaria', 'mouse-drag-throw', 0, 262, False) for _ in range(5)]
            + [row('drawerdeck', 'mouse-drag-throw', 0, 270, True) for _ in range(5)]
            + [row('vaul', 'mouse-drag-throw', 0, 400, True) for _ in range(5)]
        )
        unsupported = unsupported_decks(rows, 'mouse-drag-throw')
        winner, _ = cell_winner(rows, 'mouse-drag-throw', 0, settle_pick, True, unsupported)
        self.assertEqual(winner, 'drawerdeck')


class DidNotCloseTest(unittest.TestCase):
    def test_deck_that_never_closes_did_not_close(self):
        rows = [
            row('reactaria', 'touch-flick-dismiss', 0, 180, True, closed=False)
            for _ in range(5)
        ]
        self.assertTrue(did_not_close(rows, 'reactaria', 'touch-flick-dismiss'))

    def test_deck_that_always_closes_is_not_flagged(self):
        rows = [
            row('drawerdeck', 'touch-flick-dismiss', 0, 180, True, closed=True)
            for _ in range(5)
        ]
        self.assertFalse(did_not_close(rows, 'drawerdeck', 'touch-flick-dismiss'))

    def test_majority_rule_a_minority_of_misses_does_not_flip_it(self):
        rows = [
            row('drawerdeck', 'touch-flick-dismiss', 0, 180, True, closed=True)
            for _ in range(3)
        ] + [
            row('drawerdeck', 'touch-flick-dismiss', 0, 180, True, closed=False)
            for _ in range(2)
        ]
        self.assertFalse(did_not_close(rows, 'drawerdeck', 'touch-flick-dismiss'))

    def test_majority_rule_a_majority_of_misses_flips_it(self):
        rows = [
            row('drawerdeck', 'touch-flick-dismiss', 0, 180, True, closed=True)
            for _ in range(2)
        ] + [
            row('drawerdeck', 'touch-flick-dismiss', 0, 180, True, closed=False)
            for _ in range(3)
        ]
        self.assertTrue(did_not_close(rows, 'drawerdeck', 'touch-flick-dismiss'))

    def test_no_closed_field_at_all_is_not_flagged(self):
        # A scenario that isn't `dismiss` (or a row from before this field
        # existed): `closed` is always `None`, so this never fires.
        rows = [{'deck': 'vaul', 'scenario': 'mouse-drag-throw', 'load': 0, 'settleMs': 180}]
        self.assertFalse(did_not_close(rows, 'vaul', 'mouse-drag-throw'))

    def test_did_not_close_is_scoped_to_its_own_scenario(self):
        rows = [
            row('reactaria', 'touch-flick-dismiss', 0, 180, True, closed=False)
            for _ in range(5)
        ] + [row('reactaria', 'open-to-half', 0, 150, True) for _ in range(5)]
        self.assertTrue(did_not_close(rows, 'reactaria', 'touch-flick-dismiss'))
        self.assertFalse(did_not_close(rows, 'reactaria', 'open-to-half'))

    def test_did_not_close_decks_only_names_the_ones_that_never_close(self):
        rows = [
            row('reactaria', 'touch-flick-dismiss', 0, 180, True, closed=False)
            for _ in range(5)
        ] + [
            row('drawerdeck', 'touch-flick-dismiss', 0, 180, True, closed=True)
            for _ in range(5)
        ]
        self.assertEqual(
            did_not_close_decks(rows, 'touch-flick-dismiss'), {'reactaria'}
        )


class CellWinnerExcludesDidNotCloseTest(unittest.TestCase):
    def test_a_deck_that_never_closes_cannot_win_even_with_the_best_number(self):
        # reactaria's settleMs (180ms, from a 2s close-wait timeout plus a
        # short motion settle) is numerically the best here, but it never
        # reported closed, so drawerdeck -- slower, but really closed --
        # wins.
        rows = (
            [row('reactaria', 'touch-flick-dismiss', 0, 180, True, closed=False) for _ in range(5)]
            + [row('drawerdeck', 'touch-flick-dismiss', 0, 300, True, closed=True) for _ in range(5)]
            + [row('vaul', 'touch-flick-dismiss', 0, 400, True, closed=True) for _ in range(5)]
        )
        excluded = excluded_decks(rows, 'touch-flick-dismiss')
        winner, _ = cell_winner(rows, 'touch-flick-dismiss', 0, settle_pick, True, excluded)
        self.assertEqual(winner, 'drawerdeck')

    def test_not_supported_and_did_not_close_combine_in_the_same_exclusion(self):
        # A deck excluded under rule 11 (never responded) and one excluded
        # under rule 12 (never reported closed) are both kept out of the
        # same cell's winner at once.
        rows = (
            [row('reactaria', 'touch-flick-dismiss', 0, 180, True, closed=False) for _ in range(5)]
            + [row('baseui', 'touch-flick-dismiss', 0, 190, False, closed=True) for _ in range(5)]
            + [row('drawerdeck', 'touch-flick-dismiss', 0, 300, True, closed=True) for _ in range(5)]
        )
        excluded = excluded_decks(rows, 'touch-flick-dismiss')
        self.assertEqual(excluded, {'reactaria', 'baseui'})
        winner, _ = cell_winner(rows, 'touch-flick-dismiss', 0, settle_pick, True, excluded)
        self.assertEqual(winner, 'drawerdeck')


if __name__ == '__main__':
    unittest.main()
