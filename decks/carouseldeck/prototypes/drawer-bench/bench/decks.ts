// THROWAWAY (#233). The three drawers this bench drives. Every page
// shares `#trigger` and `window.__bench` (../src/harness.ts); the open
// drawer's panel is `#panel` on every one of them (the bench's own
// marker, not any library's).

export interface DeckDef {
  key: string;
  label: string;
  url: string;
}

export const DECKS: DeckDef[] = [
  {
    key: 'drawerdeck',
    label: 'drawerdeck (real @drawerdeck/react, #245)',
    url: 'bench-drawerdeck.html'
  },
  { key: 'vaul', label: 'vaul 1.1.2', url: 'bench-vaul.html' },
  { key: 'baseui', label: 'Base UI Drawer 1.9.0', url: 'bench-baseui.html' }
];
