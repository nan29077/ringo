// Refunding an order that is already in a settlement (H2).
// pending batch  → order leaves the batch and the batch total shrinks
// paid batch     → a negative "refund deduction" row is created and subtracted from the next payout
// Usage: CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/tools/settlement-refund.mjs
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3031';
const T = 60000;
const errors = [];
let step = 0;
const ok = (m) => console.log(`✔ ${++step}. ${m}`);
const fail = (m) => { console.error(`✘ ${m}`); errors.push(m); };
const money = (s) => Number(String(s).replace(/[^0-9.-]/g, '')) || 0;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
page.on('pageerror', (e) => fail(`pageerror ${e.message}`));

async function toast() {
  return page.locator('[data-sonner-toast]').last().innerText({ timeout: 15000 }).catch(() => '');
}
async function createBatch(sellerName) {
  await page.goto(`${BASE}/admin/settlements`, { timeout: T });
  const row = page.locator('tr').filter({ hasText: sellerName }).first();
  await row.locator('summary', { hasText: '정산서 생성' }).click();
  await row.locator('form button', { hasText: '생성' }).click();
  return toast();
}
/** First order row of the settlement detail page (the console nav also links to /admin/orders/*). */
async function orderLink() {
  const hrefs = await page.locator('main table a[href^="/admin/orders/"]').evaluateAll((a) => a.map((x) => x.getAttribute('href')));
  const href = hrefs.find((h) => /\/admin\/orders\/[0-9a-f-]{36}$/.test(h));
  if (!href) throw new Error('settlement has no order rows');
  return href;
}
async function recordManualRefund(reason) {
  const form = page.locator('form').filter({ has: page.locator('input[name=ack]') }).first();
  await form.locator('input[name=reason]').fill(reason);
  await form.locator('input[name=ack]').check();
  await form.locator('button[type=submit], button:not([type])').last().click();
}
/** Settlement rows in the list: [created, seller, period, orders, gross, commission, net, status, reference] */
async function settlementRows() {
  await page.goto(`${BASE}/admin/settlements?size=50`, { timeout: T });
  return page.locator('table').last().locator('tbody tr').evaluateAll((trs) =>
    trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim())),
  );
}

try {
  await page.goto(`${BASE}/login`, { timeout: T });
  await page.fill('input[name=email]', 'admin@ringo.local');
  await page.fill('input[name=password]', 'ringo1234!');
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: T }), page.click('button[type=submit]')]);
  ok('signed in as admin');

  // ---------- pending batch ----------
  console.log('  batch:', await createBatch('Studio North'));
  let rows = await settlementRows();
  const pending = rows.find((r) => r[7].includes('지급 대기'));
  if (!pending) throw new Error('no pending settlement was created');
  const beforeNet = money(pending[6]);
  const beforeOrders = Number(pending[3]);
  ok(`pending batch created: ${beforeOrders} orders, net ${pending[6]}`);

  await page.goto(`${BASE}/admin/settlements?size=50`, { timeout: T });
  await page.locator('table').last().locator('tbody tr').filter({ hasText: '지급 대기' }).first().locator('a[href^="/admin/settlements/"]').first().click();
  await page.waitForURL(/\/admin\/settlements\/[0-9a-f-]{36}/, { timeout: T });
  const pendingUrl = page.url();
  const firstOrder = await orderLink();
  await page.goto(`${BASE}${firstOrder}`, { timeout: T });
  if (!(await page.getByText('지급 대기 중인 정산서에 포함').count())) fail('order detail does not warn about the pending settlement');
  else ok('order detail warns that the order is in a pending batch');
  const orderNet = money(await page.locator('main').innerText().then((x) => x.match(/정산액[\s\S]{0,40}?\$([\d,.]+)/)?.[1] ?? '0'));
  await recordManualRefund('QA: refund of an order inside a pending settlement');
  console.log('  refund:', await toast());

  await page.goto(pendingUrl, { timeout: T });
  const afterOrders = Number((await page.locator('main').innerText()).match(/주문 (\d+)건/)?.[1] ?? '-1');
  const afterNet = money((await page.locator('main').innerText()).match(/지급액[\s\S]{0,40}?\$([\d,.]+)/)?.[1] ?? '0');
  if (afterOrders !== beforeOrders - 1) fail(`pending batch order count ${afterOrders}, expected ${beforeOrders - 1}`);
  else ok(`refunded order left the pending batch (${beforeOrders} → ${afterOrders} orders)`);
  if (Math.abs(afterNet - (beforeNet - orderNet)) > 0.02) fail(`pending batch net ${afterNet}, expected ${(beforeNet - orderNet).toFixed(2)}`);
  else ok(`pending batch payout recalculated (${beforeNet} → ${afterNet})`);

  // ---------- paid batch ----------
  await page.goto(pendingUrl, { timeout: T });
  await page.locator('input[name=reference]').first().fill('QA-TRANSFER-1');
  await page.getByRole('button', { name: /지급 완료/ }).first().click();
  console.log('  payout:', await toast());
  await page.goto(pendingUrl, { timeout: T });
  const paidOrder = await orderLink();
  await page.goto(`${BASE}${paidOrder}`, { timeout: T });
  if (!(await page.getByText('이미 판매자에게 정산 지급').count())) fail('order detail does not warn that the order was already paid out');
  else ok('order detail warns that the payout was already sent');
  const paidOrderNet = money((await page.locator('main').innerText()).match(/정산액[\s\S]{0,40}?\$([\d,.]+)/)?.[1] ?? '0');
  await recordManualRefund('QA: refund after payout');
  console.log('  refund:', await toast());

  rows = await settlementRows();
  const adjustment = rows.find((r) => r[0].includes('환불 차감'));
  if (!adjustment) fail('no refund-deduction settlement row was created');
  else if (money(adjustment[6]) >= 0) fail(`deduction is not negative: ${adjustment[6]}`);
  else ok(`refund after payout recorded as a deduction of ${adjustment[6]}`);

  await page.goto(`${BASE}/admin/settlements`, { timeout: T });
  const queue = await page.locator('tr').filter({ hasText: 'Studio North' }).first().innerText();
  if (!/환불 차감/.test(queue)) fail('payout queue does not show the pending deduction');
  else ok('payout queue shows the deduction against the next payout');

  // The deduction is merged into the next batch instead of being paid separately.
  // Drop the refund window so the seller's remaining orders become payable and a new batch can be created.
  await page.goto(`${BASE}/admin/settings`, { timeout: T });
  const commerce = page.locator('form').filter({ has: page.locator('input[name=refundWindowDays]') });
  await commerce.locator('input[name=refundWindowDays]').fill('0');
  await commerce.locator('button[type=submit], button:not([type])').last().click();
  console.log('  settings:', await toast());
  console.log('  batch:', await createBatch('Studio North'));
  rows = await settlementRows();
  const merged = rows.find((r) => r[0].includes('환불 차감') && r[7].includes('지급 완료'));
  if (!merged) fail('deduction was not consumed by the next batch');
  else ok('deduction was merged into the next payout batch');
  const stillQueued = await page.goto(`${BASE}/admin/settlements`, { timeout: T }).then(() => page.locator('tr').filter({ hasText: 'Studio North' }).first().innerText());
  if (/환불 차감/.test(stillQueued)) fail('deduction still shows in the payout queue after being merged');
  else ok('payout queue no longer shows the merged deduction');
  rows = await settlementRows();
  const newBatch = rows.find((r) => r[7].includes('지급 대기') && !r[0].includes('환불 차감'));
  if (!newBatch) fail('no new pending batch after merging');
  else if (Math.abs(money(newBatch[6]) - (money(newBatch[4]) - Math.abs(money(newBatch[5])))) > 0.02) {
    // The merged deduction lowers gross, commission and net together, so the row must still add up.
    fail(`new batch net ${newBatch[6]} != gross ${newBatch[4]} - commission ${newBatch[5]}`);
  } else ok(`new batch totals add up after the deduction (net ${newBatch[6]})`);

  await page.goto(`${BASE}/admin/settlements?size=50`, { timeout: T });
  await page.locator('table').last().locator('tbody tr').filter({ hasText: '지급 대기' }).first().locator('a[href^="/admin/settlements/"]').first().click();
  await page.waitForURL(/\/admin\/settlements\/[0-9a-f-]{36}/, { timeout: T });
  const mergedUrl = page.url();
  const detail = await page.locator('main').innerText();
  if (!detail.includes('차감된 환불')) fail('new batch detail does not list the applied refund deduction');
  else if (!detail.includes(String(Math.abs(paidOrderNet).toFixed(2)))) fail(`new batch detail does not show the ${paidOrderNet} deduction amount`);
  else ok(`new batch detail lists the applied deduction of ${paidOrderNet}`);

  // ---------- refunding out of a batch that absorbed a deduction ----------
  // The batch is rebuilt from its remaining orders, so the deduction must go back to the pending pool
  // instead of being written off with the shrinking batch.
  const inMerged = await orderLink();
  await page.goto(`${BASE}${inMerged}`, { timeout: T });
  await recordManualRefund('QA: refund out of a batch that absorbed a deduction');
  console.log('  refund:', await toast());
  rows = await settlementRows();
  const released = rows.find((r) => r[0].includes('환불 차감') && r[7].includes('지급 대기'));
  if (!released) fail('the merged deduction was not released back to pending');
  else ok(`deduction released back to pending (${released[6]})`);
  const rebuilt = rows.find((r) => r[7].includes('지급 대기') && !r[0].includes('환불 차감'));
  if (rebuilt && money(rebuilt[6]) <= 0) fail(`batch left with a non-positive payout: ${rebuilt[6]}`);
  else ok(rebuilt ? `remaining batch still pays out ${rebuilt[6]}` : 'batch was cancelled (nothing left to pay)');
  await page.goto(`${BASE}/admin/settlements`, { timeout: T });
  if (!/환불 차감/.test(await page.locator('tr').filter({ hasText: 'Studio North' }).first().innerText())) {
    fail('released deduction is not back in the payout queue');
  } else ok('released deduction is charged against the next payout again');
  void mergedUrl;
} catch (err) {
  fail(`exception: ${err.stack || err}`);
}
await browser.close();
console.log(errors.length ? `\nFAILED (${errors.length})\n${errors.join('\n')}` : '\nALL CHECKS PASSED');
process.exit(errors.length ? 1 : 0);
