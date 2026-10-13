import { createContext } from 'react';

/**
 * Internal staging switch for #144: true renders loop as shells (empty,
 * inert snap targets with the one real slide placed over whichever is
 * nearest, ADR-0013) instead of copies, for the new tests only, while
 * every existing suite keeps rendering copies. Not exported from the
 * package entry. Deleted once shells are the default (#144's Task 7).
 */
export const LoopShells = createContext(false);
