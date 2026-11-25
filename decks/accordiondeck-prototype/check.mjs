// Runs the state-model checks of ADR 0001 ("State and the browser") in Chromium, Firefox
// and WebKit, with React 19. No network: React is bundled locally with esbuild.
import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const here = fileURLToPath(new URL('.', import.meta.url));
await mkdir(here + '.build', { recursive: true });
const common = { bundle: true, jsx: 'automatic', logLevel: 'error', define: { 'process.env.NODE_ENV': '"development"' } };
await build({ ...common, entryPoints: [here + 'client.jsx'], outfile: here + '.build/client.js', format: 'iife', platform: 'browser' });
await build({ ...common, entryPoints: [here + 'server.jsx'], outfile: here + '.build/server.mjs', format: 'esm', platform: 'node', packages: 'external' });
const { render } = await import(pathToFileURL(here + '.build/server.mjs'));
const clientJs = await readFile(here + '.build/client.js', 'utf8');
const indexHtml = await readFile(here + 'index.html', 'utf8');

const ORIGIN = 'http://proto.test';
const wait = (page, ms = 150) => page.waitForTimeout(ms);
const j = (x) => JSON.stringify(x);
const eq = (a, b) => j(a) === j(b);

// Logs every toggle event (capture, since toggle does not bubble) with the group's state
// at that moment and a task number (events in one task share it).
const initScript = () => {
  window.__tl = [];
  let task = 0, pending = false;
  document.addEventListener('toggle', (e) => {
    if (!pending) { pending = true; task++; setTimeout(() => { pending = false; }, 0); }
    const group = [...document.querySelectorAll('details')].map((d) => d.id + (d.open ? '+' : '-')).join(' ');
    window.__tl.push({ id: e.target.id, ev: e.oldState + '>' + e.newState, task, group });
  }, true);
};

async function open(browser, html) {
  const page = await (await browser.newContext()).newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(m.text().slice(0, 140)); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message.slice(0, 140)));
  await page.addInitScript(initScript);
  await page.route(ORIGIN + '/**', (r) => r.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(ORIGIN + '/');
  page.consoleErrors = consoleErrors;
  return page;
}
const shell = (inner) => `<!doctype html><html><body><div id="root">${inner}</div></body></html>`;
const dom = (page) => page.evaluate(() => [...document.querySelectorAll('#root details')].map((d) => d.id + (d.open ? '+' : '-')).join(' '));
const ctl = (page) => page.evaluate(() => ({ calls: window.__ctl.calls, probe: window.__ctl.probe, value: window.__ctl.getValue?.(), errors: window.__ctl.errors, btn: window.__ctl.buttonClicks }));
async function mounted(browser, { variant = 'group', initial = ['a'], ctl: c = {} } = {}) {
  const page = await open(browser, shell(''));
  await page.addScriptTag({ content: clientJs });
  await page.evaluate((o) => window.mountClient(o), { variant, initial, ctl: c });
  await wait(page);
  await page.evaluate(() => { window.__ctl.calls.length = 0; window.__ctl.probe.length = 0; window.__tl.length = 0; });
  return page;
}

const cases = [];
const add = (name, fn) => cases.push({ name, fn });

add('1a baseline, no handler: DOM diverges from state (expected)', async (b) => {
  const p = await mounted(b, { ctl: { decline: true, naive: true } });
  await p.click('#sb'); await wait(p);
  const d = await dom(p); const c = await ctl(p);
  return { pass: d === 'a- b+ c-' && eq(c.value, ['a']), detail: `dom "${d}", state ${j(c.value)}` };
});
add('1b prevented click: DOM and state stay matched', async (b) => {
  const p = await mounted(b, { ctl: { decline: true } });
  await p.click('#sb'); await wait(p);
  const d = await dom(p); const c = await ctl(p);
  return { pass: d === 'a+ b- c-' && eq(c.value, ['a']) && eq(c.calls, [['b']]), detail: `dom "${d}", state ${j(c.value)}, onValueChange ${j(c.calls)}` };
});
add('1c prevented Enter and Space: DOM and state stay matched', async (b) => {
  const p = await mounted(b, { ctl: { decline: true } });
  await p.focus('#sb'); await p.keyboard.press('Enter'); await wait(p);
  const d1 = await dom(p);
  await p.keyboard.press('Space'); await wait(p);
  const d2 = await dom(p); const c = await ctl(p);
  return { pass: d1 === 'a+ b- c-' && d2 === d1 && eq(c.calls, [['b'], ['b']]), detail: `after Enter "${d1}", after Space "${d2}", calls ${j(c.calls)}` };
});
add('1d accepted click: DOM and state follow', async (b) => {
  const p = await mounted(b);
  await p.click('#sb'); await wait(p);
  const d = await dom(p); const c = await ctl(p);
  return { pass: d === 'a- b+ c-' && eq(c.value, ['b']) && eq(c.calls, [['b']]), detail: `dom "${d}", state ${j(c.value)}, calls ${j(c.calls)}` };
});
add('1e declined fragment open is written back, reported once', async (b) => {
  const p = await mounted(b, { ctl: { decline: true } });
  await p.evaluate(() => { location.hash = '#deep-c'; }); await wait(p, 300);
  const d = await dom(p); const c = await ctl(p);
  return { pass: d === 'a+ b- c-' && eq(c.value, ['a']) && eq(c.calls, [['c']]), detail: `dom "${d}", state ${j(c.value)}, calls ${j(c.calls)}` };
});

add('2a click before hydration, then hydrateRoot: DOM unchanged, adopted', async (b) => {
  const p = await open(b, shell(render('group', ['a'])));
  const initial = await dom(p);
  await p.click('#sb'); await wait(p);
  const before = await dom(p);
  const preToggles = await p.evaluate(() => window.__tl.map((t) => t.id + ':' + t.ev));
  await p.evaluate(() => { window.__tl.length = 0; });
  await p.addScriptTag({ content: clientJs });
  await p.evaluate(() => window.hydrate({ variant: 'group', initial: ['a'], ctl: {} })); await wait(p, 300);
  const after = await dom(p); const c = await ctl(p);
  const hydToggles = await p.evaluate(() => window.__tl.map((t) => t.id + ':' + t.ev));
  const pass = initial === 'a+ b- c-' && before === 'a- b+ c-' && after === before && eq(c.calls, [['b']]) && eq(c.value, ['b']) && c.errors.length === 0 && p.consoleErrors.length === 0;
  return { pass, detail: `ssr "${initial}", after click "${before}" (toggles ${j(preToggles)}), after hydrate "${after}" (toggles ${j(hydToggles)}), adopted ${j(c.calls)}, state ${j(c.value)}, recoverable errors ${c.errors.length}, console ${p.consoleErrors.length}` };
});
add('2b parsed open fires toggle on load', async (b) => {
  const p = await open(b, shell(render('group', ['a'])));
  await wait(p);
  const t = await p.evaluate(() => window.__tl.map((x) => x.id + ':' + x.ev));
  return { pass: t.includes('a:closed>open'), detail: `toggles on load ${j(t)}` };
});

add('3a React-driven switch (prevented click): event order, one call', async (b) => {
  const p = await mounted(b);
  await p.click('#sb'); await wait(p);
  const t = await p.evaluate(() => window.__tl); const c = await ctl(p); const d = await dom(p);
  const pass = t.length === 2 && t[0].task === t[1].task && t[0].group === 'a- b+ c-' && eq(c.calls, [['b']]) && d === 'a- b+ c-';
  return { pass, detail: `order ${t.map((x) => x.id + ':' + x.ev).join(', ')}; same task ${t[0]?.task === t[1]?.task}; DOM at first toggle "${t[0]?.group}"; onValueChange ${j(c.calls)}` };
});
add('3b non-adjacent switch (b to c, a closed): one call per switch', async (b) => {
  const p = await mounted(b);
  await p.click('#sb'); await wait(p); await p.click('#sc'); await wait(p);
  const c = await ctl(p); const d = await dom(p);
  return { pass: d === 'a- b- c+' && eq(c.calls, [['b'], ['c']]), detail: `dom "${d}", calls ${j(c.calls)}` };
});

add('4a fragment into closed item, open sibling (browser-driven group switch, handler)', async (b) => {
  const p = await mounted(b);
  await p.evaluate(() => { location.hash = '#deep-c'; }); await wait(p, 300);
  const d = await dom(p); const c = await ctl(p); const tl = await p.evaluate(() => window.__tl);
  const t = tl.map((x) => x.id + ':' + x.ev);
  // Root's own read at each toggle (c.probe), not only the capture listener's.
  const pass = d === 'a- b- c+' && eq(c.calls, [['c']]) && eq(c.value, ['c']) && tl.length === 2 && tl[0].group === 'a- b- c+' && c.probe.length === 2 && c.probe.every((x) => eq(x.opens, ['c']));
  return { pass, detail: `dom "${d}", state ${j(c.value)}, calls ${j(c.calls)}, order ${j(t)}, same task ${tl[0]?.task === tl[1]?.task}, DOM at first toggle "${tl[0]?.group}", Root read at each toggle ${j(c.probe)}` };
});
add('4b fragment navigation on index.html variant 4 (native)', async (b) => {
  const p = await open(b, indexHtml);
  const st = () => p.evaluate(() => [1, 2, 3, 4, 5].map((i) => document.getElementById('v4-' + i).open ? '+' : '-').join(''));
  const s0 = await st();
  await p.evaluate(() => { location.hash = '#word-tamarind'; }); await wait(p, 300);
  const s1 = await st();
  await p.evaluate(() => { location.hash = '#word-quokka'; }); await wait(p, 300);
  const s2 = await st();
  return { pass: s0 === '+----' && s1 === '---+-' && s2 === '-+---', detail: `load ${s0}, #word-tamarind ${s1}, #word-quokka ${s2}` };
});

add('5a link, button and prevented child inside a Trigger do not toggle; title does', async (b) => {
  const p = await mounted(b, { variant: 'summary', initial: [] });
  const isOpen = () => p.evaluate(() => document.getElementById('x').open);
  await p.click('#lnk'); await wait(p);
  const afterLink = await isOpen(); const hash = await p.evaluate(() => location.hash);
  await p.click('#btn'); await wait(p);
  const afterBtn = await isOpen(); const c1 = await ctl(p);
  await p.click('#stop'); await wait(p);
  const afterStop = await isOpen();
  await p.click('#label'); await wait(p);
  const afterLabel = await isOpen();
  await p.click('#label'); await wait(p);
  const afterLabel2 = await isOpen(); const c2 = await ctl(p);
  const pass = !afterLink && hash === '#elsewhere' && !afterBtn && c1.btn === 1 && !afterStop && afterLabel && !afterLabel2 && eq(c2.calls, [['x'], []]);
  return { pass, detail: `link open=${afterLink} hash=${hash}; button open=${afterBtn} clicks=${c1.btn}; prevented child open=${afterStop}; title open=${afterLabel} then ${afterLabel2}; calls ${j(c2.calls)}` };
});
add('5b same, native, on index.html variant 5 (no script)', async (b) => {
  const p = await open(b, indexHtml);
  const isOpen = () => p.evaluate(() => document.getElementById('v5-1').open);
  await p.click('#v5-link'); await wait(p);
  const l = await isOpen(); const hash = await p.evaluate(() => location.hash);
  await p.click('#v5-button'); await wait(p);
  const bt = await isOpen(); const clicks = await p.evaluate(() => window.__v5Clicks);
  await p.click('#v5-s1', { position: { x: 8, y: 8 } }); await wait(p);
  const s = await isOpen();
  return { pass: !l && hash === '#v5' && !bt && clicks === 1 && s, detail: `link open=${l} hash=${hash}; button open=${bt} clicks=${clicks}; summary text open=${s}` };
});
add('6 index.html variant 3 keeps aria-expanded in sync', async (b) => {
  const p = await open(b, indexHtml);
  const ae = () => p.evaluate(() => document.getElementById('v3-s1').getAttribute('aria-expanded'));
  const a0 = await ae();
  await p.click('#v3-s1'); await wait(p);
  const a1 = await ae();
  await p.click('#v3-s1'); await wait(p);
  const a2 = await ae();
  return { pass: a0 === 'false' && a1 === 'true' && a2 === 'false', detail: `load ${a0}, opened ${a1}, closed ${a2}` };
});

const engines = [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]];
let failed = 0;
const pad = (s, n) => (s.length > n ? s.slice(0, n - 1) + '~' : s.padEnd(n));
for (const [name, type] of engines) {
  const browser = await type.launch();
  console.log(`\n## ${name} ${browser.version()}`);
  const rows = [];
  for (const c of cases) {
    let r;
    try { r = await c.fn(browser); } catch (e) { r = { pass: false, detail: 'threw: ' + e.message.split('\n')[0] }; }
    if (!r.pass) failed++;
    rows.push(`${pad(c.name, 72)} ${r.pass ? 'PASS' : 'FAIL'}  ${r.detail}`);
  }
  console.log(rows.join('\n'));
  await browser.close();
}
console.log(failed ? `\n${failed} failing case(s)` : '\nall cases pass');
process.exit(failed ? 1 : 0);
