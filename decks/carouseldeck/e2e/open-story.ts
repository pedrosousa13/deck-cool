import type { Page } from '@playwright/test';

/**
 * Opens story `id`, with Storybook `args` if any and `query` appended to the
 * URL as it is (`&log=1` turns on the loop stories' event log), and waits
 * until every deck in it is rendered and measured: its engine has settled
 * once, which marks the slides in view and gives React the deck's measured
 * state in the same layout effect. Every test opens its story with this before its first
 * assertion. The wait is not an assertion, so the expect timeout does not
 * bound it, only the test's: under load, a worker's first, cold load of a
 * story can outlast the expect timeout, and every assertion after the wait
 * still gets that timeout for what it checks.
 */
export async function openStory(
  page: Page,
  id: string,
  args?: string,
  query = ''
) {
  await page.goto(
    `/iframe.html?id=${id}&viewMode=story${args ? `&args=${args}` : ''}${query}`
  );
  await page.waitForFunction(() => {
    const viewports = [
      ...document.querySelectorAll('[data-carouseldeck-viewport]')
    ];
    return (
      viewports.length > 0 &&
      viewports.every((viewport) =>
        viewport.querySelector('[data-carouseldeck-slide][data-in-view]')
      )
    );
  });
}
