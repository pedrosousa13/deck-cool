// Server-rendered markup for the carouseldeck mount pages (#340). Built by
// `../../vite.ssr.config.ts` into `dist-ssr/carouseldeck.mjs`;
// `scripts/generate-mount-pages.mjs` imports it and calls `renderMarkup` for
// every (n, dirty) combination to produce each `mount-carouseldeck-*-ssr.html`
// page's pre-rendered body. Renders the same `CarouseldeckApp` the gesture
// bench and `client-entry-carouseldeck.tsx` use, through `MountApp`, so the
// server markup and the client's first hydrated render are built from
// exactly the same component.

import { renderToString } from 'react-dom/server';
import { CarouseldeckApp } from '../carouseldeck-app';
import { MountApp } from './mount-app';

export function renderMarkup(n: number, dirty: boolean): string {
  return renderToString(
    <MountApp n={n} dirty={dirty} Deck={CarouseldeckApp} />
  );
}
