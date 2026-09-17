// Checks the defects found in the 2026-09-17 second review, after the fixes.
// Usage: CHROMIUM_PATH=/opt/pw-browsers/chromium BASE_URL=http://127.0.0.1:3071 node tests/tools/fix-verify.mjs
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3031';
const T = 60000;
const errors = [];
let step = 0;
const ok = (m) => console.log(`✔ ${++step}. ${m}`);
const fail = (m) => { console.error(`✘ ${m}`); errors.push(m); };
const stamp = Date.now().toString(36);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const admin = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
const buyer = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
for (const p of [admin, buyer]) {
  p.on('dialog', (d) => d.accept());
  p.on('pageerror', (e) => fail(`pageerror ${e.message.slice(0, 120)}`));
}
const toast = (p) => p.locator('[data-sonner-toast]').last().innerText({ timeout: 15000 }).catch(() => '');
async function login(p, email, password = 'ringo1234!') {
  await p.goto(`${BASE}/login`, { timeout: T });
  await p.fill('input[name=email]', email);
  await p.fill('input[name=password]', password);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: T }), p.click('button[type=submit]')]);
}

try {
  await login(admin, 'admin@ringo.local');
  await login(buyer, 'buyer@ringo.local');
  ok('signed in');

  // --- set the shortest payment window and leave an unpaid order to check at the end (B1) ---
  await admin.goto(`${BASE}/admin/settings`, { timeout: T });
  const commerce = admin.locator('form').filter({ has: admin.locator('input[name=pendingPaymentMinutes]') });
  await commerce.locator('input[name=pendingPaymentMinutes]').fill('5');
  await commerce.locator('button[type=submit], button:not([type])').last().click();
  await toast(admin);
  await buyer.goto(`${BASE}/checkout?product=editorial-essentials`, { timeout: T });
  await buyer.check('input[name=terms]');
  await Promise.all([buyer.waitForURL((u) => u.pathname.startsWith('/pay/test/'), { timeout: T }), buyer.getByRole('button', { name: /^Pay / }).click()]);
  await buyer.goto(`${BASE}/account/orders`, { timeout: T });
  const pendingHref = await buyer.locator('a[href^="/checkout/"]').first().getAttribute('href');
  if (!pendingHref) throw new Error('no pending order was created');
  const pendingId = pendingHref.split('/').pop();
  const startedAt = Date.now();
  ok(`left an unpaid order (${pendingId.slice(0, 8)}) with a 5 minute window`);

  // --- A1: an admin edit must not leave a published product undeliverable ---
  await admin.goto(`${BASE}/admin/products?q=Make+Good+Work`, { timeout: T });
  const productHref = await admin.locator('main table a[href^="/admin/products/"]').first().getAttribute('href');
  await admin.goto(`${BASE}${productHref}?tab=edit`, { timeout: T });
  const before = await admin.locator('select[name=categoryId]').inputValue();
  const courseOption = (await admin.locator('select[name=categoryId] option').all()).find(async () => true);
  void courseOption;
  await admin.selectOption('select[name=categoryId]', 'courses');
  await admin.locator('form button[type=submit], form button:not([type])').last().click();
  const msg = await toast(admin);
  if (!/레슨|lesson/i.test(msg)) fail(`switching a published download product to a course was not blocked: "${msg}"`);
  else ok('a published product cannot be switched to a delivery type it cannot fulfil');
  await admin.goto(`${BASE}${productHref}?tab=edit`, { timeout: T });
  if ((await admin.locator('select[name=categoryId]').inputValue()) !== before) fail('the rejected edit still changed the category');
  else ok('the rejected edit left the product untouched');
  // A fresh visitor, because the demo buyer already owns this product.
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`${BASE}/p/make-good-work`, { timeout: T });
  if (!(await visitor.getByRole('link', { name: /Buy now|바로 구매/ }).count())) fail('the product is no longer purchasable after the rejected edit');
  else ok('the product is still on sale and purchasable');

  // --- S1: a non-UUID filter must not 500 ---
  const sellerCtx = await browser.newContext();
  const seller = await sellerCtx.newPage();
  await login(seller, 'studio@ringo.local');
  for (const path of ['/seller/reviews?product=zz', '/seller/links?product=zz', "/seller/reviews?product='%3B--"]) {
    const res = await seller.goto(`${BASE}${path}`, { timeout: T });
    if (res.status() !== 200) fail(`${path} returned ${res.status()}`);
  }
  ok('seller lists ignore an unusable product filter instead of failing');

  // --- S2: the seller dashboard balance must add up ---
  await seller.goto(`${BASE}/seller`, { timeout: T });
  const dash = await seller.locator('main').innerText();
  const m = dash.match(/미정산 잔액\s*\$?([\d,.]+)[\s\S]{0,80}?다음 정산 가능 \$?(-?[\d,.]+)\s*·\s*보류 \$?(-?[\d,.]+)/);
  if (!m) fail(`could not read the unsettled balance card: ${dash.slice(0, 200)}`);
  else {
    const [bal, avail, hold] = [m[1], m[2], m[3]].map((x) => Number(x.replace(/,/g, '')));
    if (Math.abs(bal - (avail + hold)) > 0.02) fail(`unsettled ${bal} != available ${avail} + holding ${hold}`);
    else ok(`unsettled balance adds up (${bal} = ${avail} + ${hold})`);
  }

  // --- A2: the settlement cards must ignore refund deductions ---
  await admin.goto(`${BASE}/admin/settlements`, { timeout: T });
  const cards = await admin.locator('main').innerText();
  if (/누적 지급액\s*-\$/.test(cards)) fail('the paid-out card went negative, so deductions are still counted as payouts');
  else ok('settlement cards are not distorted by refund deductions');

  // --- A4 / A5: CSV numbers stay numeric and timestamps are local ---
  const csv = await admin.request.get(`${BASE}/admin/orders/export`);
  const body = await csv.text();
  if (/"'-[\d.]+"/.test(body)) fail('CSV still quotes negative numbers as text');
  else ok('CSV keeps negative amounts numeric');
  if (/\d{4}-\d{2}-\d{2}T[\d:.]+Z/.test(body)) fail('CSV still contains UTC timestamps');
  else if (!/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(body)) fail('CSV has no readable timestamps');
  else ok('CSV timestamps are written in the site timezone');

  // --- B3: the buyer sees the order in their own language ---
  await buyer.goto(`${BASE}/account/profile`, { timeout: T });
  await buyer.selectOption('select[name=locale]', 'ko');
  await buyer.locator('form').filter({ has: buyer.locator('select[name=locale]') }).locator('button[type=submit], button:not([type])').last().click();
  await buyer.waitForTimeout(2000);
  await buyer.goto(`${BASE}/account/orders`, { timeout: T });
  const list = await buyer.locator('main').innerText();
  if (!/[가-힣]/.test(list.split('\n').slice(0, 25).join('\n'))) fail('order list titles are still English for a Korean account');
  else ok('order titles follow the account language');

  // --- B2: the mobile menu closes when the route changes ---
  const mob = await (await browser.newContext({ viewport: { width: 390, height: 840 } })).newPage();
  await mob.goto(`${BASE}/`, { timeout: T });
  await mob.locator('.site-menu > summary').click();
  if (!(await mob.locator('.site-menu[open]').count())) fail('the mobile menu did not open');
  await mob.locator('.site-menu nav a').first().click();
  await mob.waitForTimeout(1500);
  if (await mob.locator('.site-menu[open]').count()) fail('the mobile menu stayed open after navigating');
  else ok('the mobile menu closes itself after a navigation');

  // --- B(low): a used reset link explains itself ---
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`${BASE}/reset-password?token=not-a-real-token`, { timeout: T });
  const resetText = await anon.locator('main').innerText();
  if (await anon.locator('input[name=password]').count()) fail('an invalid reset link still shows the password form');
  else if (!/만료|expired/i.test(resetText)) fail(`invalid reset link shows no explanation: ${resetText.slice(0, 120)}`);
  else ok('an invalid reset link explains itself instead of showing a dead form');

  // --- B1: the unpaid order is closed once its window passes ---
  const waitMs = 5 * 60000 - (Date.now() - startedAt) + 15000;
  if (waitMs > 0) {
    console.log(`  waiting ${Math.round(waitMs / 1000)}s for the payment window to elapse…`);
    await buyer.waitForTimeout(waitMs);
  }
  await buyer.goto(`${BASE}/checkout/${pendingId}`, { timeout: T });
  if (!buyer.url().includes('/account/orders/')) fail(`resuming an expired order did not redirect: ${buyer.url()}`);
  const orderText = await buyer.locator('main').innerText();
  if (!/결제 가능 시간이 지나|payment window/i.test(orderText)) fail('the expired order page shows no explanation');
  else ok('resuming an expired order explains that it was closed');
  if (await buyer.getByRole('link', { name: /결제하기|Complete payment/ }).count()) fail('the expired order still offers a payment button');
  else ok('the expired order no longer offers to pay');
  await buyer.goto(`${BASE}/account/orders`, { timeout: T });
  const afterList = await buyer.locator('main').innerText();
  if (/결제 대기/.test(afterList) && afterList.includes(pendingId.slice(0, 8))) fail('the order list still shows it as awaiting payment');
  else ok('the order list shows the closed order');
  void stamp;
} catch (err) {
  fail(`exception: ${err.stack || err}`);
}
await browser.close();
console.log(errors.length ? `\nFAILED (${errors.length})\n${errors.join('\n')}` : '\nALL CHECKS PASSED');
process.exit(errors.length ? 1 : 0);
