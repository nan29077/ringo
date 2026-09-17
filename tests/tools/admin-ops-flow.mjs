// Click-through of the super-admin order / member / operator / settlement flows on data this script creates itself.
// Usage: CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/tools/admin-ops-flow.mjs [step,...]
import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:3031';
const SHOTS = '/tmp/claude-0/shots';
const steps = (process.argv[2] || 'buy,member,operator,settlement').split(',');
const stamp = Date.now().toString(36);
const buyerEmail = `ops-${stamp}@example.com`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const wire = (page, tag) => {
  page.on('pageerror', (e) => console.log(tag, 'PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log(tag, 'CONSOLE', m.text().slice(0, 200)); });
  page.on('dialog', (d) => { console.log(tag, 'confirm:', d.message().slice(0, 90)); d.accept(); });
};
const toastInit = () => {
  window.__toasts = [];
  const seen = new WeakSet();
  setInterval(() => {
    for (const n of document.querySelectorAll('[data-sonner-toast]')) {
      const text = n.innerText.replace(/\s+/g, ' ').trim();
      if (!seen.has(n) && text) { seen.add(n); window.__toasts.push(text); }
    }
  }, 50);
};
// Runs an action and waits for the next toast it produces.
const act = async (page, fn) => {
  const before = await page.evaluate(() => (window.__toasts || []).length);
  await fn();
  await page.waitForFunction((n) => (window.__toasts || []).length > n, before, { timeout: 60000 });
  const text = await page.evaluate((n) => window.__toasts[n], before);
  console.log('  toast:', text);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  return text;
};
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/flow_${name}.png`, fullPage: true });

// Buyer: sign up + buy a download product with the test provider
const buyerCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const buyer = await buyerCtx.newPage();
wire(buyer, '[buyer]');
await buyer.goto(`${BASE}/signup`);
await buyer.fill('input[name=name]', `Ops Tester ${stamp}`);
await buyer.fill('input[name=email]', buyerEmail);
await buyer.fill('input[name=password]', 'ringo1234!');
await buyer.check('input[name=terms]');
await buyer.click('button[type=submit]');
await buyer.waitForURL((u) => !u.pathname.startsWith('/signup'), { timeout: 60000 });
console.log('signed up', buyerEmail);

let _orderUrl = null;
if (steps.includes('buy')) {
  await buyer.goto(`${BASE}/checkout?product=creative-practice-workbook`, { waitUntil: 'networkidle' });
  await buyer.check('input[name=terms]');
  await buyer.locator('form[aria-busy] button').last().click();
  await buyer.waitForURL(/\/pay\/test\//, { timeout: 60000 });
  await buyer.getByRole('button', { name: /Approve test payment|테스트 결제 승인/ }).click();
  await buyer.waitForURL(/\/account\/orders\//, { timeout: 60000 });
  console.log('bought ->', buyer.url());
}

// Admin
const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const admin = await adminCtx.newPage();
wire(admin, '[admin]');
await adminCtx.addInitScript(toastInit);
await admin.goto(`${BASE}/login`);
await admin.fill('input[name=email]', 'admin@ringo.local');
await admin.fill('input[name=password]', 'ringo1234!');
await admin.click('button[type=submit]');
await admin.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });

if (steps.includes('buy')) {
  await admin.goto(`${BASE}/admin/orders?q=${encodeURIComponent(buyerEmail)}`, { waitUntil: 'networkidle' });
  await admin.locator('table a[href^="/admin/orders/"]').first().click();
  await admin.waitForURL(/\/admin\/orders\/[0-9a-f-]{36}/);
  _orderUrl = admin.url();
  await admin.waitForLoadState('networkidle');
  await shot(admin, 'order_paid');
  // resend receipt
  await act(admin, () => admin.getByRole('button', { name: /영수증 재발송|Resend receipt/ }).click());
  // memo
  await admin.fill('textarea[name=memo]', 'Flow test memo');
  await act(admin, () => admin.getByRole('button', { name: /메모 저장|Save memo/ }).click());
  // force refund
  const force = admin.locator('form').filter({ has: admin.locator('input[name=mode][value=provider]') });
  await force.locator('input[name=reason]').fill('Admin flow test: force refund');
  await act(admin, () => force.locator('button').click());
  await admin.waitForLoadState('networkidle');
  await shot(admin, 'order_refunded');
}

if (steps.includes('member')) {
  await admin.goto(`${BASE}/admin/members?q=${encodeURIComponent(buyerEmail)}`, { waitUntil: 'networkidle' });
  await admin.locator(`table a[href^="/admin/members/"]`).first().click();
  await admin.waitForURL(/\/admin\/members\/[0-9a-f-]{36}/);
  await admin.waitForLoadState('networkidle');
  await admin.locator('textarea[name=reason]').fill('Flow test suspension');
  await act(admin, () => admin.getByRole('button', { name: /회원 정지|Suspend member/ }).click());
  // suspended buyer session must be gone
  const r = await buyer.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
  console.log('  buyer after suspend ->', buyer.url(), r?.status());
  await admin.reload({ waitUntil: 'networkidle' });
  await shot(admin, 'member_suspended');
  await act(admin, () => admin.getByRole('button', { name: /이용 재개|Reactivate/ }).click());
  await act(admin, () => admin.getByRole('button', { name: /인증 처리|Mark verified/ }).click());
  await act(admin, () => admin.getByRole('button', { name: /비밀번호 재설정 메일|Send reset link/ }).click());
  // grant + revoke
  const grant = admin.locator('form').filter({ has: admin.locator('select[name=productId]') });
  const firstOption = await grant.locator('select[name=productId] option:not([disabled])').first().getAttribute('value');
  await grant.locator('select[name=productId]').selectOption(firstOption);
  await grant.locator('input[name=reason]').fill('Flow test compensation');
  await act(admin, () => grant.locator('button').click());
  await admin.waitForLoadState('networkidle');
  await admin.locator('details summary', { hasText: /권한 회수|Revoke/ }).first().click();
  const rev = admin.locator('details[open] form');
  await rev.locator('input[name=reason]').fill('Flow test revoke');
  await act(admin, () => rev.locator('button').click());
  await admin.waitForLoadState('networkidle');
  await shot(admin, 'member_detail');
}

if (steps.includes('operator')) {
  await admin.goto(`${BASE}/admin/operators`, { waitUntil: 'networkidle' });
  await admin.fill('input[name=email]', buyerEmail);
  await act(admin, () => admin.getByRole('button', { name: /운영자로 지정|Promote to operator/ }).click());
  await admin.waitForLoadState('networkidle');
  await shot(admin, 'operators_promoted');
  const row = admin.locator('tr', { hasText: buyerEmail });
  await act(admin, () => row.getByRole('button', { name: /권한 해제|Remove access/ }).click());
  await admin.waitForLoadState('networkidle');
  console.log('  still listed after demote:', await admin.locator('tr', { hasText: buyerEmail }).count());
  // self-demote guard: own row has no button
  console.log('  own row buttons:', await admin.locator('tr', { hasText: 'admin@ringo.local' }).getByRole('button').count());
}

if (steps.includes('settlement')) {
  await admin.goto(`${BASE}/admin/settlements`, { waitUntil: 'networkidle' });
  const summary = admin.locator('details summary', { hasText: /정산서 생성|Create batch/ }).first();
  if (await summary.count()) {
    await summary.click();
    const f = admin.locator('details[open] form');
    await f.locator('input[name=memo]').fill('Flow test batch');
    await f.locator('button').click();
    await admin.waitForURL(/\/admin\/settlements\/[0-9a-f-]{36}/, { timeout: 60000 });
    await admin.waitForLoadState('networkidle');
    await shot(admin, 'settlement_created');
    await admin.fill('input[name=reference]', `BANK-${stamp}`);
    await act(admin, () => admin.getByRole('button', { name: /지급 완료 · 판매자 알림|Mark as paid/ }).click());
    await admin.waitForLoadState('networkidle');
    await shot(admin, 'settlement_paid');
  } else console.log('  no eligible seller for a payout batch');
}

await browser.close();
