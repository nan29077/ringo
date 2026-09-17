// UI regressions from the 2026-09-17 review: chart rendering, admin product filters, deep-link click
// consistency, the notice anchor and English pluralization.
// Usage: CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/tools/ui-regress.mjs
import { chromium } from '@playwright/test';
const BASE = process.env.BASE_URL;
const T = 60000;
const errs = []; let step = 0;
const ok = (m) => console.log(`✔ ${++step}. ${m}`);
const fail = (m) => { console.error(`✘ ${m}`); errs.push(m); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
const warns = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') warns.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => fail(`pageerror ${e.message.slice(0, 120)}`));
try {
  await page.goto(`${BASE}/login`, { timeout: T });
  await page.fill('input[name=email]', 'admin@ringo.local');
  await page.fill('input[name=password]', 'ringo1234!');
  await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);

  // L4 / L10 — dashboard chart: no Recharts size warning, real bars render
  warns.length = 0;
  await page.goto(`${BASE}/admin`, { timeout: T });
  await page.waitForTimeout(2500);
  const sizeWarn = warns.filter(w => /width\(-?\d+\)|height\(-?\d+\)/.test(w));
  if (sizeWarn.length) fail(`chart size warning still logged: ${sizeWarn[0]}`);
  else ok('dashboard chart renders without the Recharts size warning');
  const bars = await page.locator('.recharts-bar-rectangle').count();
  const empty = await page.getByText(/No sales in this period yet|이 기간에는 매출이 없습니다/).count();
  if (!bars && !empty) fail('chart shows neither bars nor an empty-state message');
  else ok(bars ? `chart drew ${bars} bars` : 'chart shows the empty-state message instead of a blank axis');

  // L2 — price + featured filters on the admin product list
  await page.goto(`${BASE}/admin/products`, { timeout: T });
  const hasFeatured = await page.locator('select[aria-label="추천"], select[aria-label="Featured"]').count();
  const hasPrice = await page.locator('input[aria-label*="가격"], input[aria-label*="Price"]').count();
  if (!hasFeatured || hasPrice < 2) fail(`filter controls missing (featured=${hasFeatured}, price inputs=${hasPrice})`);
  else ok('product list has featured and price-range filters');
  await page.goto(`${BASE}/admin/products?featured=yes`, { timeout: T });
  const featuredRows = await page.locator('main table tbody tr').count();
  await page.goto(`${BASE}/admin/products?min=30`, { timeout: T });
  const pricedRows = await page.locator('main table tbody tr').count();
  await page.goto(`${BASE}/admin/products`, { timeout: T });
  const allRows = await page.locator('main table tbody tr').count();
  if (!(featuredRows > 0 && featuredRows < allRows)) fail(`featured filter did not narrow the list (${featuredRows}/${allRows})`);
  else ok(`featured filter narrows ${allRows} → ${featuredRows} rows`);
  if (!(pricedRows > 0 && pricedRows < allRows)) fail(`price filter did not narrow the list (${pricedRows}/${allRows})`);
  else ok(`price filter (min 30) narrows ${allRows} → ${pricedRows} rows`);

  // L3 — the click counter on /admin/links and the click log behind /admin/analytics/traffic must agree
  await page.goto(`${BASE}/admin/links`, { timeout: T });
  const counters = await page.locator('main table tbody tr').evaluateAll(trs => trs.map(tr => {
    const td = [...tr.querySelectorAll('td')];
    return { name: td[0]?.innerText.trim().split('\n')[0] ?? '', clicks: Number((td[4]?.innerText ?? '').replace(/[^0-9]/g, '')) };
  }));
  const counterTotal = counters.reduce((a, r) => a + r.clicks, 0);
  // "Clicks by source" (3rd column) is counted from link_clicks rows.
  await page.goto(`${BASE}/admin/analytics/traffic?range=365`, { timeout: T });
  const tables = page.locator('main table');
  let loggedTotal = 0;
  for (let i = 0; i < (await tables.count()); i++) {
    const head = await tables.nth(i).locator('thead').innerText();
    if (!/클릭|Clicks/.test(head) || /누적/.test(head)) continue;
    const col = (await tables.nth(i).locator('thead th').allInnerTexts()).findIndex(h => /^(클릭|Clicks)$/.test(h.trim()));
    if (col < 0) continue;
    const vals = await tables.nth(i).locator('tbody tr').evaluateAll((trs, c) => trs.map(tr => Number((tr.querySelectorAll('td')[c]?.innerText ?? '0').replace(/[^0-9]/g, '')) || 0), col);
    loggedTotal = vals.reduce((a, v) => a + v, 0);
    break;
  }
  if (!counterTotal) fail('deep links report zero clicks — the seed did not record any');
  else if (loggedTotal < counterTotal * 0.9) fail(`click log (${loggedTotal}) does not match the counters (${counterTotal})`);
  else ok(`click counters (${counterTotal}) and the click log (${loggedTotal}) agree`);

  // L8 — a notice anchor opens the collapsed item (buyer-facing notices page, no seller role needed)
  await page.goto(`${BASE}/notices`, { timeout: T });
  const ids = await page.locator('details[id]').evaluateAll(d => d.map(x => x.id));
  const closedLoc = page.locator('details[id]:not([open])');
  const closed = (await closedLoc.count()) ? await closedLoc.first().getAttribute('id') : null;
  if (!closed) { ok(`all ${ids.length} notices already open (nothing to expand)`); }
  else {
    await page.goto(`${BASE}/notices#${closed}`, { timeout: T });
    await page.waitForTimeout(1200);
    const isOpen = await page.locator(`details[id="${closed}"]`).evaluate(d => d.open);
    if (!isOpen) fail('anchored notice did not expand');
    else ok('anchored notice expands automatically');
  }

  // L20 — singular/plural in English storefront copy
  const store = await b.newContext({ extraHTTPHeaders: { cookie: 'ringo-lang=en' } });
  const sp = await store.newPage();
  await sp.goto(`${BASE}/?q=make+good+work`, { timeout: T });
  const txt = await sp.locator('main').innerText();
  const m = txt.match(/(\d+)\s+results?\b/);
  if (!m) fail(`search result count not found: ${txt.slice(0, 120)}`);
  else if (m[1] === '1' && !/1 result\b/.test(txt)) fail(`singular not used: "${m[0]}"`);
  else ok(`search count reads "${m[0]}"`);
} catch (e) { fail(`exception: ${e.stack || e}`); }
await b.close();
console.log(errs.length ? `\nFAILED (${errs.length})\n${errs.join('\n')}` : '\nALL CHECKS PASSED');
process.exit(errs.length ? 1 : 0);
