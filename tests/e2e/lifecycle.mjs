// Full marketplace lifecycle across all three roles, against a running server (default http://127.0.0.1:3031).
// seller application → admin approval → product + file → review → approval → deep-link purchase → coupon purchase
// → download → refund request → seller refund → access revoked.
// Usage: CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/e2e/lifecycle.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3031';
const T = 120000;
const stamp = Date.now().toString(36);
const shots = '/tmp/claude-0/shots/e2e';
fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
let step = 0;
const ok = (msg) => console.log(`✔ ${++step}. ${msg}`);
const fail = (msg) => { console.error(`✘ ${msg}`); errors.push(msg); };

async function session(name) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => fail(`[${name}] pageerror ${e.message}`));
  page.shot = (n) => page.screenshot({ path: `${shots}/${String(step).padStart(2, '0')}-${name}-${n}.png`, fullPage: true });
  return { ctx, page };
}
async function login(page, email, password = 'ringo1234!') {
  await page.goto(`${BASE}/login`, { timeout: T });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: T }), page.click('button[type=submit]')]);
}
async function signup(page, name, email, password) {
  await page.goto(`${BASE}/signup`, { timeout: T });
  await page.fill('input[name=name]', name);
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await page.check('input[name=terms]');
  await Promise.all([page.waitForURL((u) => u.pathname.startsWith('/account'), { timeout: T }), page.click('button[type=submit]')]);
}
async function toast(page) {
  return page.locator('[data-sonner-toast]').last().innerText({ timeout: 15000 }).catch(() => '');
}

const password = 'Passw0rd!' + stamp;
const sellerEmail = `seller-${stamp}@example.com`;
const buyerEmail = `buyer-${stamp}@example.com`;
const store = `QA Store ${stamp}`;
const storeSlug = `qa-${stamp}`;
const productTitle = `QA Field Guide ${stamp}`;

try {
  // 1. Signup + seller application
  const S = await session('seller');
  await signup(S.page, 'QA Seller', sellerEmail, password);
  ok('seller account signed up');
  await S.page.goto(`${BASE}/sell`, { timeout: T });
  await S.page.fill('input[name=displayName]', store);
  await S.page.fill('input[name=slug]', storeSlug);
  await S.page.fill('textarea[name=applicationNote]', 'I sell practical field guides for creators in Manila.');
  await S.page.fill('input[name=payoutAccountName]', 'QA Seller');
  await S.page.fill('input[name=payoutAccountNumber]', '0917-123-4567');
  await Promise.all([S.page.waitForURL((u) => u.pathname.startsWith('/sell/status') || u.pathname.startsWith('/seller'), { timeout: T }), S.page.locator('form button[type=submit]').last().click()]);
  ok(`seller application submitted → ${new URL(S.page.url()).pathname}`);

  // 2. Admin approves the application
  const A = await session('admin');
  await login(A.page, 'admin@ringo.local');
  await A.page.goto(`${BASE}/admin/sellers/applications`, { timeout: T });
  const card = A.page.locator('div.grid').filter({ hasText: store }).filter({ has: A.page.getByRole('button', { name: '입점 승인' }) }).last();
  await card.getByRole('button', { name: '입점 승인' }).click();
  console.log('  toast:', await toast(A.page));
  ok('admin approved the seller application');

  // 3. Seller creates a download product, uploads a file, submits for review
  await S.page.goto(`${BASE}/seller/products/new`, { timeout: T });
  if (!new URL(S.page.url()).pathname.startsWith('/seller/products/new')) throw new Error(`seller center not reachable: ${S.page.url()}`);
  await S.page.selectOption('select[name=categoryId]', 'ebooks');
  await S.page.fill('input[name=titleEn]', productTitle);
  await S.page.fill('input[name=titleKo]', `QA 필드 가이드 ${stamp}`);
  await S.page.fill('textarea[name=descriptionEn]', 'A compact guide used by the automated lifecycle test.');
  await S.page.fill('textarea[name=descriptionKo]', '자동 테스트용 가이드입니다.');
  await S.page.fill('input[name=price]', '20');
  await Promise.all([S.page.waitForURL((u) => /\/seller\/products\/[0-9a-f-]{36}/.test(u.pathname), { timeout: T }), S.page.getByRole('button', { name: '임시저장' }).click()]);
  const productId = S.page.url().match(/products\/([0-9a-f-]{36})/)[1];
  ok(`product draft saved (${productId})`);
  const file = path.join(os.tmpdir(), `ringo-guide-${stamp}.pdf`);
  fs.writeFileSync(file, `%PDF-1.4\n% Ringo QA file ${stamp}\n`);
  await S.page.locator('input[type=file]').first().setInputFiles(file);
  await S.page.getByText('업로드 완료').first().waitFor({ timeout: T });
  await S.page.reload();
  if (!(await S.page.getByText(path.basename(file)).count())) fail('uploaded file not listed');
  await S.page.getByRole('button', { name: '심사 요청' }).first().click();
  console.log('  toast:', await toast(S.page));
  await S.page.reload();
  if (!(await S.page.getByText('심사 대기').count())) fail('product not pending review');
  ok('file uploaded and product submitted for review');

  // 4. Admin approves the product
  await A.page.goto(`${BASE}/admin/products/review`, { timeout: T });
  const row = A.page.locator('div, article, tr').filter({ hasText: productTitle }).filter({ has: A.page.getByRole('button', { name: '승인 (판매 시작)' }) }).last();
  await row.getByRole('button', { name: '승인 (판매 시작)' }).click();
  console.log('  toast:', await toast(A.page));
  await A.page.goto(`${BASE}/admin/products/${productId}`, { timeout: T });
  if (!(await A.page.getByText('판매중').count())) fail('product not published after approval');
  const slug = (await A.page.locator(`a[href^="/p/"]`).first().getAttribute('href'))?.replace('/p/', '');
  ok(`admin approved product → /p/${slug}`);

  // 5. Buyer arrives through a deep link and buys the linked product
  const B = await session('buyer');
  await signup(B.page, 'QA Buyer', buyerEmail, password);
  await B.page.goto(`${BASE}/l/mgw-insta`, { timeout: T });
  if (!B.page.url().includes('/p/make-good-work')) fail(`deep link redirect wrong: ${B.page.url()}`);
  await B.page.goto(`${BASE}/checkout?product=make-good-work`, { timeout: T });
  await B.page.check('input[name=terms]');
  await Promise.all([B.page.waitForURL((u) => u.pathname.startsWith('/pay/test/'), { timeout: T }), B.page.getByRole('button', { name: /^Pay / }).click()]);
  await Promise.all([B.page.waitForURL((u) => u.pathname.startsWith('/account/orders/'), { timeout: T }), B.page.getByRole('button', { name: 'Approve test payment' }).click()]);
  const linkedOrder = B.page.url().match(/orders\/([0-9a-f-]{36})/)[1];
  ok('buyer purchased via deep link with test payment');
  await A.page.goto(`${BASE}/admin/orders/${linkedOrder}`, { timeout: T });
  const orderText = await A.page.locator('main').innerText();
  if (!/instagram/.test(orderText) || !/creative-start/.test(orderText)) fail('deep link attribution missing on order');
  else ok('admin order detail shows deep-link attribution (instagram / creative-start)');

  // 6. Buyer buys the new product with a coupon
  await B.page.goto(`${BASE}/checkout?product=${slug}&coupon=WELCOME10`, { timeout: T });
  const checkoutText = await B.page.locator('main').innerText();
  if (!checkoutText.includes('$18.00')) fail('coupon discount not applied (expected $18.00)');
  await B.page.check('input[name=terms]');
  await Promise.all([B.page.waitForURL((u) => u.pathname.startsWith('/pay/test/'), { timeout: T }), B.page.getByRole('button', { name: /^Pay / }).click()]);
  await Promise.all([B.page.waitForURL((u) => u.pathname.startsWith('/account/orders/'), { timeout: T }), B.page.getByRole('button', { name: 'Approve test payment' }).click()]);
  const orderUrl = B.page.url().split('?')[0];
  const orderId = orderUrl.match(/orders\/([0-9a-f-]{36})/)[1];
  ok('buyer purchased the new product with WELCOME10 ($18.00)');

  // Coupon discounts are borne by the seller: the 10% fee stays on the $20 list price.
  await A.page.goto(`${BASE}/admin/orders/${orderId}`, { timeout: T });
  const money = await A.page.locator('main').innerText();
  const fee = money.match(/판매 수수료[\s\S]{0,20}?\$([\d.]+)/)?.[1];
  const net = money.match(/판매자 정산액[\s\S]{0,20}?\$([\d.]+)/)?.[1];
  if (fee !== '2.00' || net !== '16.00') fail(`coupon order commission/net wrong: fee=${fee} net=${net} (expected 2.00 / 16.00)`);
  else ok('coupon discount is charged to the seller (fee $2.00 on the $20 list price, net $16.00)');
  if (!/정가 \$20\.00/.test(money)) fail('order detail does not explain the commission basis');
  else ok('order detail explains that the fee is charged on the list price');

  // Transactional mail follows the recipient's language (buyer signed up in English).
  await A.page.goto(`${BASE}/admin/messages?q=${encodeURIComponent(buyerEmail)}`, { timeout: T });
  const mailList = await A.page.locator('main').innerText();
  if (!/Your Ringo order|Verify your Ringo email/.test(mailList)) fail('buyer emails are not in English');
  else ok('buyer emails were rendered from the English templates');

  // 7. Download from library
  await B.page.goto(`${BASE}/account/library`, { timeout: T });
  const dl = B.page.locator(`a[href^="/api/download/asset/"]`).first();
  const href = await dl.getAttribute('href');
  const res = await B.page.request.get(`${BASE}${href}`);
  const body = await res.text();
  if (res.status() !== 200 || !body.includes(stamp)) fail(`download failed: ${res.status()}`);
  else ok('library download returns the uploaded file');
  const anon = await browser.newContext();
  const anonRes = await anon.request.get(`${BASE}${href}`, { maxRedirects: 0 });
  if (anonRes.status() === 200) fail('download accessible without login');
  else ok(`anonymous download blocked (${anonRes.status()})`);

  // 8. Refund request → seller approves → access revoked
  await B.page.goto(orderUrl, { timeout: T });
  await B.page.fill('textarea[name=reason]', 'Bought by mistake during testing.');
  await B.page.getByRole('button', { name: 'Request refund' }).click();
  console.log('  toast:', await toast(B.page));
  await S.page.goto(`${BASE}/seller/orders/${orderId}`, { timeout: T });
  await S.page.getByRole('button', { name: /환불 승인/ }).click();
  console.log('  toast:', await toast(S.page));
  await S.page.reload();
  if (!(await S.page.getByText('환불 완료').count())) fail('seller refund not completed');
  const after = await B.page.request.get(`${BASE}${href}`);
  if (after.status() === 200) fail('download still allowed after refund');
  else ok(`refund completed by seller; buyer access revoked (${after.status()})`);

  // 9. Emails were recorded
  await A.page.goto(`${BASE}/admin/messages?q=${encodeURIComponent(buyerEmail)}`, { timeout: T });
  const mails = await A.page.locator('main').innerText();
  if (!mails.includes(buyerEmail)) fail('no emails recorded for buyer');
  else ok('transactional emails recorded in the email log');
  await A.page.shot('messages');
} catch (err) {
  fail(`exception: ${err.stack || err}`);
}
await browser.close();
console.log(errors.length ? `\nFAILED (${errors.length})\n${errors.join('\n')}` : '\nALL STEPS PASSED');
process.exit(errors.length ? 1 : 0);
