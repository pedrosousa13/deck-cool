// Server-rendered markup for the keen mount pages (#340). See
// ssr-entry-carouseldeck.tsx's own header comment for the shape every one
// of these five files follows.

import { renderToString } from 'react-dom/server';
import { KeenApp } from '../keen-app';
import { MountApp } from './mount-app';

export function renderMarkup(n: number, dirty: boolean): string {
  return renderToString(<MountApp n={n} dirty={dirty} Deck={KeenApp} />);
}
