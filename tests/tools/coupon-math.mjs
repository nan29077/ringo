// Coupon policy: the discount is borne by the seller, so the commission is charged on the list price
// and capped at what the buyer actually paid (a payout can never go negative).
// Usage: CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/tools/coupon-math.mjs
import { chromium } from '@playwright/test';
const BASE = process.env.BASE_URL, T = 60000;
const errs = []; let step = 0;
const ok = m => console.log(`✔ ${++step}. ${m}`);
const fail = m => { console.error(`✘ ${m}`); errs.push(m); };
const stamp = Date.now().toString(36);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const admin = await (await b.newContext({viewport:{width:1500,height:1000}})).newPage();
const buyer = await (await b.newContext({viewport:{width:1400,height:1000}})).newPage();
admin.on('dialog', d => d.accept()); buyer.on('dialog', d => d.accept());
const money = s => Number(String(s).replace(/[^0-9.]/g, '')) || 0;
async function login(p, email) {
  await p.goto(`${BASE}/login`, { timeout: T });
  await p.fill('input[name=email]', email); await p.fill('input[name=password]', 'ringo1234!');
  await Promise.all([p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: T }), p.click('button[type=submit]')]);
}
async function makeCoupon(code, kind, value) {
  await admin.goto(`${BASE}/admin/coupons/new`, { timeout: T });
  await admin.fill('input[name=code]', code);
  await admin.fill('input[name=name]', `QA ${code}`);
  await admin.selectOption('select[name=kind]', kind);
  await admin.locator('input[name=value]').fill(String(value));
  await admin.locator('form button').last().click();
  await admin.waitForTimeout(2500);
}
async function buy(slug, coupon) {
  await buyer.goto(`${BASE}/checkout?product=${slug}&coupon=${coupon}`, { timeout: T });
  const summary = await buyer.locator('main').innerText();
  await buyer.check('input[name=terms]');
  const payBtn = buyer.getByRole('button', { name: /^(Pay |Get it free|무료로 받기)/ }).first();
  await payBtn.click();
  await buyer.waitForURL(u => u.pathname.startsWith('/pay/test/') || u.pathname.startsWith('/account/orders/'), { timeout: T });
  if (buyer.url().includes('/pay/test/')) {
    await Promise.all([buyer.waitForURL(u => u.pathname.startsWith('/account/orders/'), { timeout: T }), buyer.getByRole('button', { name: 'Approve test payment' }).click()]);
  }
  return { orderId: buyer.url().match(/orders\/([0-9a-f-]{36})/)[1], summary };
}
async function orderMath(id) {
  await admin.goto(`${BASE}/admin/orders/${id}`, { timeout: T });
  const txt = await admin.locator('main').innerText();
  return {
    // "결제 금액" is also the panel heading, so require the amount to follow the label directly.
    total: money(txt.match(/결제 금액\s*\n\s*\$([\d.,]+)/)?.[1]),
    fee: money(txt.match(/판매 수수료[\s\S]{0,20}?\$([\d.]+)/)?.[1]),
    net: money(txt.match(/판매자 정산액[\s\S]{0,20}?\$([\d.]+)/)?.[1]),
    status: /결제 완료|refunded|환불/.test(txt) ? 'ok' : 'unknown',
  };
}
try {
  await login(admin, 'admin@ringo.local');
  await login(buyer, 'buyer@ringo.local');
  ok('signed in');

  // 100% coupon → free order, no fee, no payout, still fulfilled
  const c1 = `QAFREE${stamp.toUpperCase()}`.slice(0, 20);
  await makeCoupon(c1, 'percent', 100);
  const r1 = await buy('editorial-essentials', c1);   // $29 product the demo buyer does not own
  const m1 = await orderMath(r1.orderId);
  if (m1.total !== 0) fail(`100% coupon did not make the order free: total ${m1.total}`);
  else if (m1.fee !== 0 || m1.net !== 0) fail(`free order should have no fee or payout: fee ${m1.fee}, net ${m1.net}`);
  else ok('100% coupon: buyer pays $0, commission $0, seller payout $0 (no negative payout)');
  await buyer.goto(`${BASE}/account/library`, { timeout: T });
  if (!(await buyer.getByText(/Editorial Essentials/i).count())) fail('free order did not grant access');
  else ok('free order still delivers the product to the library');

  // Fixed coupon larger than the commission → fee capped at what the buyer paid
  const c2 = `QACAP${stamp.toUpperCase()}`.slice(0, 20);
  await makeCoupon(c2, 'fixed', 37);                   // $39 product → $2 left, below the $3.90 fee
  const r2 = await buy('type-play-studio', c2);        // $39 product, 10% fee = $3.90
  const m2 = await orderMath(r2.orderId);
  if (m2.total !== 2) fail(`expected a $2 order, got ${m2.total}`);
  else if (m2.fee !== 2 || m2.net !== 0) fail(`fee should be capped at the amount paid: fee ${m2.fee}, net ${m2.net}`);
  else ok('deep discount: $2 paid → commission capped at $2, seller payout $0 (never negative)');

  // Ordinary coupon → seller bears it, platform fee unchanged
  const c3 = `QA10${stamp.toUpperCase()}`.slice(0, 20);
  await makeCoupon(c3, 'percent', 10);
  const r3 = await buy('slow-summer-presets', c3);     // $19 product
  const m3 = await orderMath(r3.orderId);
  const expectedFee = Math.round(19 * 0.1 * 100) / 100;
  if (Math.abs(m3.total - 17.1) > 0.02) fail(`expected $17.10 total, got ${m3.total}`);
  else if (Math.abs(m3.fee - expectedFee) > 0.02) fail(`fee should stay ${expectedFee} (list price), got ${m3.fee}`);
  else if (Math.abs(m3.net - (m3.total - m3.fee)) > 0.02) fail(`net ${m3.net} != ${m3.total} - ${m3.fee}`);
  else ok(`10% coupon on $19: buyer $${m3.total}, fee $${m3.fee} (unchanged), seller $${m3.net}`);
} catch (e) { fail(`exception: ${e.stack || e}`); }
await b.close();
console.log(errs.length ? `\nFAILED (${errs.length})\n${errs.join('\n')}` : '\nALL CHECKS PASSED');
process.exit(errs.length ? 1 : 0);
