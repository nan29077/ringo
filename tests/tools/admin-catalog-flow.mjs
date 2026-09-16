// Admin console click-through for products / categories / coupons / banners / notices / settings / reviews / inquiries.
// Usage: CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/tools/admin-catalog-flow.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:3031';
const RUN = Date.now().toString(36).slice(-5);
const SHOTS = '/tmp/claude-0/shots';
const T = 90000;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const results = [];
const ok = (step, detail = '') => { results.push(['OK', step, detail]); console.log('OK  ', step, detail); };
const fail = (step, err) => { results.push(['FAIL', step, String(err).slice(0, 300)]); console.log('FAIL', step, String(err).slice(0, 300)); };

async function newPage(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(T);
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));
  await page.goto(BASE + '/login', { timeout: T });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'ringo1234!');
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: T });
  return page;
}
const go = (page, path) => page.goto(BASE + path, { waitUntil: 'load', timeout: T });
async function toast(page, label) {
  const el = page.locator('[data-sonner-toast]').last();
  await el.waitFor({ state: 'visible', timeout: T });
  const text = (await el.innerText()).replace(/\s+/g, ' ').trim();
  const type = await el.getAttribute('data-type');
  await page.locator('[data-sonner-toast]').first().waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
  await page.locator('[data-sonner-toast]').last().waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
  if (type === 'error') throw new Error(`${label}: ${text}`);
  return text;
}
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/flow_${name}.png`, fullPage: true });
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
async function step(name, fn) { if (ONLY.length && !ONLY.some((p) => name.startsWith(p))) return; try { const d = await fn(); ok(name, d ?? ''); } catch (e) { fail(name, e); } }

const admin = await newPage('admin@ringo.local');
let productUrl = '';

// ---------- Products ----------
await step('product.create', async () => {
  await go(admin, '/admin/products/new');
  await admin.selectOption('select[name=sellerId]', { label: 'Studio North' });
  await admin.selectOption('select[name=categoryId]', 'ebooks');
  await admin.fill('input[name=titleEn]', `QA Admin Product ${RUN}`);
  await admin.fill('input[name=titleKo]', `QA 관리자 상품 ${RUN}`);
  await admin.fill('textarea[name=descriptionEn]', 'Created by the admin click-through test.');
  await admin.fill('input[name=price]', '9.50');
  await admin.click('button[type=submit]:has-text("임시저장")');
  await admin.waitForURL(/\/admin\/products\/[0-9a-f-]{36}$/, { timeout: T });
  productUrl = new URL(admin.url()).pathname;
  return productUrl;
});
await step('product.upload_file', async () => {
  const file = `/tmp/claude-0/qa-${RUN}.txt`;
  fs.writeFileSync(file, 'QA asset ' + RUN);
  await admin.locator('input[type=file]').first().setInputFiles(file);
  await toast(admin, 'upload');
  await admin.getByText(`qa-${RUN}.txt`).first().waitFor({ timeout: T });
});
await step('product.publish_now', async () => {
  await admin.click('button:has-text("바로 판매 시작")');
  const m = await toast(admin, 'publish');
  await admin.locator('textarea[name=reason]').waitFor({ timeout: T });
  return m;
});
await step('product.toggle_featured', async () => {
  await admin.locator('span:has-text("추천") + button').first().click();
  await admin.waitForTimeout(1500);
});
await step('product.suspend', async () => {
  await admin.fill('textarea[name=reason]', 'QA suspension test');
  await admin.click('button:has-text("판매 중지")');
  return toast(admin, 'suspend');
});
await step('product.reinstate', async () => {
  await admin.click('button:has-text("판매 재개")');
  return toast(admin, 'reinstate');
});
await step('product.edit', async () => {
  await go(admin, productUrl + '?tab=edit');
  await admin.fill('input[name=price]', '11.00');
  await admin.click('button:has-text("변경사항 저장")');
  return toast(admin, 'edit');
});
await step('product.history', async () => {
  await go(admin, productUrl + '?tab=history');
  for (const a of ['product.create', 'product.publish', 'product.status', 'product.update']) await admin.getByText(a, { exact: true }).first().waitFor({ timeout: T });
  await shot(admin, 'product_history');
});
await step('product.overview_shot', async () => { await go(admin, productUrl); await shot(admin, 'product_detail'); });
await step('product.archive', async () => {
  await admin.click('button:has-text("보관하기")');
  return toast(admin, 'archive');
});
await step('product.export_csv', async () => {
  const res = await admin.request.get(BASE + '/admin/products/export?q=QA%20Admin%20Product%20' + RUN);
  const body = await res.text();
  if (!body.includes(`QA Admin Product ${RUN}`)) throw new Error('export missing row: ' + body.slice(0, 200));
  return `${res.status()} ${body.split('\n').length - 1} rows`;
});

// ---------- Categories ----------
const catId = `qa-${RUN}`;
await step('category.create', async () => {
  await go(admin, '/admin/categories');
  await admin.fill('input[name=id]', catId);
  await admin.fill('input[name=nameKo]', `QA 분류 ${RUN}`);
  await admin.fill('input[name=nameEn]', `QA Category ${RUN}`);
  await admin.click('button:has-text("분류 추가")');
  return toast(admin, 'category create');
});
await step('category.edit', async () => {
  await go(admin, `/admin/categories?edit=${catId}`);
  await admin.fill('input[name=nameKo]', `QA 분류 수정 ${RUN}`);
  await admin.click('button:has-text("변경사항 저장")');
  const m = await toast(admin, 'category edit');
  await admin.getByText(`QA 분류 수정 ${RUN}`).first().waitFor({ timeout: T });
  return m;
});
await step('category.in_use_guard', async () => {
  await go(admin, '/admin/categories?edit=ebooks');
  if (!(await admin.locator('select[disabled]').count())) throw new Error('deliveryType not locked for in-use category');
});
await step('category.delete', async () => {
  await go(admin, '/admin/categories');
  await admin.locator('tr', { hasText: catId }).locator('button:has-text("삭제")').click();
  return toast(admin, 'category delete');
});

// ---------- Coupons ----------
const code = `QAADM${RUN}`.toUpperCase();
await step('coupon.create_platform', async () => {
  await go(admin, '/admin/coupons/new');
  await admin.fill('input[name=code]', code);
  await admin.fill('input[name=name]', 'QA platform coupon');
  await admin.fill('input[name=value]', '15');
  await admin.click('button:has-text("쿠폰 만들기")');
  const m = await toast(admin, 'coupon create');
  await admin.waitForURL(/\/admin\/coupons\/[0-9a-f-]{36}$/, { timeout: T });
  return m;
});
await step('coupon.edit', async () => {
  await admin.fill('input[name=usageLimit]', '50');
  await admin.click('button:has-text("변경사항 저장")');
  return toast(admin, 'coupon edit');
});
await step('coupon.toggle', async () => {
  await go(admin, `/admin/coupons?q=${code}`);
  await admin.locator('tr', { hasText: code }).locator('button:has-text("비활성화")').click();
  return toast(admin, 'coupon toggle');
});
await step('coupon.list_shot', async () => { await go(admin, '/admin/coupons'); await shot(admin, 'coupons'); });

// ---------- Banners ----------
await step('banner.create', async () => {
  await go(admin, '/admin/banners/new');
  await admin.fill('input[name=titleKo]', `QA 배너 ${RUN}`);
  await admin.fill('input[name=titleEn]', `QA Banner ${RUN}`);
  await admin.fill('input[name=linkUrl]', 'javascript:alert(1)');
  await admin.click('button:has-text("배너 등록")');
  await toast(admin, 'banner bad url').then(() => { throw new Error('bad link URL accepted'); }, () => {});
  await admin.fill('input[name=linkUrl]', '/?category=ebooks#catalog');
  await admin.uncheck('input[name=active]');
  await admin.click('button:has-text("배너 등록")');
  await admin.waitForURL(/\/admin\/banners$/, { timeout: T });
});
await step('banner.move_up', async () => {
  const row = admin.locator('tr', { hasText: `QA 배너 ${RUN}` });
  await row.locator('button:has(.sr-only:text("위로"))').click();
  await admin.waitForTimeout(3000);
  await shot(admin, 'banners');
});
await step('banner.delete', async () => {
  await admin.locator('tr', { hasText: `QA 배너 ${RUN}` }).locator('a:has-text("수정")').click();
  await admin.waitForURL(/\/admin\/banners\/[0-9a-f-]{36}$/, { timeout: T });
  await shot(admin, 'banner_detail');
  await admin.click('button:has-text("삭제")');
  await admin.waitForURL(/\/admin\/banners$/, { timeout: T });
});

// ---------- Notices ----------
await step('notice.create', async () => {
  await go(admin, '/admin/notices/new');
  await admin.fill('input[name=title]', `QA notice ${RUN}`);
  await admin.fill('textarea[name=body]', 'QA body');
  await admin.uncheck('input[name=published]');
  await admin.click('button:has-text("공지 등록")');
  await admin.waitForURL(/\/admin\/notices$/, { timeout: T });
});
await step('notice.edit', async () => {
  await admin.click(`a:has-text("QA notice ${RUN}")`);
  await admin.waitForURL(/\/admin\/notices\/[0-9a-f-]{36}$/, { timeout: T });
  await admin.fill('textarea[name=body]', 'QA body edited');
  await admin.check('input[name=pinned]');
  await admin.click('button:has-text("변경사항 저장")');
  return toast(admin, 'notice edit');
});
await step('notice.delete', async () => {
  await admin.click('button:has-text("삭제")');
  await admin.waitForURL(/\/admin\/notices$/, { timeout: T });
});

// ---------- Settings ----------
await step('settings.change_and_revert', async () => {
  await go(admin, '/admin/settings');
  const input = admin.locator('input[name=name]');
  const original = await input.inputValue();
  await input.fill(original + ' QA');
  await admin.locator('form:has(input[name=name]) button:has-text("저장")').click();
  await toast(admin, 'settings change');
  await go(admin, '/admin/settings');
  if ((await admin.locator('input[name=name]').inputValue()) !== original + ' QA') throw new Error('not persisted');
  await admin.locator('input[name=name]').fill(original);
  await admin.locator('form:has(input[name=name]) button:has-text("저장")').click();
  await toast(admin, 'settings revert');
  return `"${original}" → "${original} QA" → reverted`;
});
await step('settings.cannot_enable_unavailable', async () => {
  await go(admin, '/admin/settings/payments');
  if (await admin.locator('tr', { hasText: 'PearPay' }).locator('button:has-text("사용"):not([disabled])').count()) throw new Error('enable button active for unavailable provider');
});

// ---------- Reviews ----------
await step('reviews.hide_unhide', async () => {
  await go(admin, '/admin/reviews?hidden=no');
  const btn = admin.locator('button:has-text("숨기기")').first();
  if (!(await btn.count())) return 'no reviews to test';
  await btn.click();
  await toast(admin, 'hide');
  await go(admin, '/admin/reviews?hidden=yes');
  await admin.locator('button:has-text("다시 공개")').first().click();
  await toast(admin, 'unhide');
  return 'hidden and restored';
});

// ---------- Inquiries ----------
await step('inquiry.buyer_create_admin_reply_close', async () => {
  const buyer = await newPage('buyer@ringo.local');
  await go(buyer, '/account/inquiries/new');
  await buyer.selectOption('select[name=category]', 'account');
  await buyer.fill('input[name=subject]', `QA inquiry ${RUN}`);
  await buyer.fill('textarea[name=body]', 'QA question from the admin flow test.');
  await buyer.click('button[type=submit]');
  await buyer.waitForURL((u) => !u.pathname.endsWith('/new'), { timeout: T });
  await buyer.context().close();
  await go(admin, `/admin/inquiries?q=${encodeURIComponent('QA inquiry ' + RUN)}`);
  await admin.click(`a:has-text("QA inquiry ${RUN}")`);
  await admin.waitForURL(/\/admin\/inquiries\/[0-9a-f-]{36}$/, { timeout: T });
  await admin.fill('textarea[name=body]', 'QA answer from Ringo support.');
  await admin.click('button:has-text("답변 등록")');
  await toast(admin, 'reply');
  await admin.click('button:has-text("문의 종료")');
  await toast(admin, 'close');
  await shot(admin, 'inquiry_detail');
});

// ---------- Review queue (own test product only) ----------
await step('queue.reject_then_approve', async () => {
  await go(admin, '/admin/products/new');
  await admin.selectOption('select[name=sellerId]', { label: 'Studio North' });
  await admin.selectOption('select[name=categoryId]', 'advertising');
  await admin.fill('input[name=titleEn]', `QA Queue Service ${RUN}`);
  await admin.fill('input[name=titleKo]', `QA 심사 서비스 ${RUN}`);
  await admin.fill('input[name=price]', '30');
  await admin.click('button[type=submit]:has-text("임시저장")');
  await admin.waitForURL(/\/admin\/products\/[0-9a-f-]{36}$/, { timeout: T });
  const id = new URL(admin.url()).pathname.split('/').pop();
  const seller = await newPage('studio@ringo.local');
  const submit = async () => {
    await go(seller, `/seller/products/${id}`);
    await seller.click('button:has-text("심사 요청")');
    await toast(seller, 'seller submit');
  };
  await submit();
  await go(admin, '/admin/products/review');
  const card = admin.locator('section', { hasText: `QA 심사 서비스 ${RUN}` });
  await card.locator('textarea[name=reason]').fill('QA: please add a sample image');
  await card.locator('button:has-text("반려")').click();
  await toast(admin, 'reject');
  await submit();
  await go(admin, '/admin/products/review');
  await shot(admin, 'review_queue');
  await admin.locator('section', { hasText: `QA 심사 서비스 ${RUN}` }).locator('button:has-text("승인")').click();
  await toast(admin, 'approve');
  await seller.context().close();
  await go(admin, `/admin/products/${id}?tab=history`);
  for (const a of ['product.reject', 'product.approve']) await admin.getByText(a, { exact: true }).first().waitFor({ timeout: T });
  // archive so the QA product does not stay on the storefront
  await go(admin, `/admin/products/${id}`);
  await admin.click('button:has-text("보관하기")');
  await toast(admin, 'archive queue product');
  return id;
});

await step('logs.audit_filter', async () => {
  await go(admin, '/admin/logs?action=category.');
  await admin.getByText('category.delete', { exact: true }).first().waitFor({ timeout: T });
});

// ---------- Cleanup of QA products left by aborted earlier runs ----------
for (const id of (process.env.QA_ARCHIVE || '').split(',').filter(Boolean)) {
  await step('cleanup.archive ' + id.slice(0, 8), async () => {
    await go(admin, `/admin/products/${id}`);
    const btn = admin.locator('button:has-text("보관하기")');
    if (!(await btn.count())) return 'already archived';
    await btn.click();
    return toast(admin, 'archive');
  });
}

await browser.close();
console.log('\nSUMMARY');
for (const r of results) console.log(r.join(' | '));
