// End-to-end storefront purchase with the test payment provider.
// node tests/tools/store-purchase.mjs <email> <product-slug> [coupon] [--decline]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [,, email, slug, coupon, flag] = process.argv;
const base = 'http://127.0.0.1:3031';
const dir = '/tmp/claude-0/shots/store/flow';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
const shot = async (name) => { await page.screenshot({ path: `${dir}/${slug}-${name}.png`, fullPage: true }); console.log('shot', name, page.url()); };
const T = 180000;

// Logged-out deep "buy" goes to login with next=checkout
await page.goto(`${base}/p/${slug}?buy=1${coupon ? `&coupon=${coupon}` : ''}`, { timeout: T });
console.log('logged-out buy=1 →', page.url());
await page.fill('input[name=email]', email);
await page.fill('input[name=password]', 'ringo1234!');
await page.click('button[type=submit]');
await page.waitForURL(u => u.pathname.startsWith('/checkout'), { timeout: T });
console.log('after login →', page.url());
await page.waitForLoadState('networkidle');
await shot('1-checkout');

const brief = page.locator('textarea[name=brief]');
if (await brief.count()) await brief.fill('Playwright test brief: three square social creatives, warm tone, for a ceramics shop launch.');
await page.check('input[name=terms]');
await Promise.all([page.waitForURL(u => u.pathname.startsWith('/pay/test/') || u.pathname.startsWith('/account/orders/'), { timeout: T }), page.getByRole('button', { name: /Pay|Get it free/ }).click()]);
await page.waitForLoadState('networkidle');
await shot('2-pay');
if (page.url().includes('/pay/test/')) {
  if (flag === '--decline') {
    await Promise.all([page.waitForURL(u => u.pathname.startsWith('/checkout/'), { timeout: T }), page.getByRole('button', { name: 'Decline' }).click()]);
    await page.waitForLoadState('networkidle');
    await shot('3-declined');
    page.once('dialog', d => d.accept());
    await Promise.all([page.waitForURL(u => u.pathname.startsWith('/account/orders/'), { timeout: T }), page.getByRole('button', { name: 'Cancel order' }).click()]);
    await page.waitForLoadState('networkidle');
    await shot('4-cancelled');
    await browser.close();
    process.exit(0);
  }
  await Promise.all([page.waitForURL(u => u.pathname.startsWith('/account/orders/'), { timeout: T }), page.getByRole('button', { name: 'Approve test payment' }).click()]);
}
await page.waitForLoadState('networkidle');
await shot('3-order-paid');
const orderUrl = page.url();
console.log('banner:', await page.locator('.sf-notice-good').first().textContent().catch(() => null));

await page.goto(`${base}/account/library`, { waitUntil: 'networkidle', timeout: T });
await shot('4-library');

const courseLink = page.getByRole('link', { name: /Open course|Continue course/ }).first();
if (await courseLink.count()) {
  await courseLink.click();
  await page.waitForURL(u => /\/account\/library\/.+/.test(u.pathname), { timeout: T });
  await page.waitForLoadState('networkidle');
  const box = page.locator('input[type=checkbox]').first();
  await box.check();
  await page.waitForTimeout(2500);
  await shot('5-course');
}

// Review
await page.goto(orderUrl.replace('?paid=1', ''), { waitUntil: 'networkidle', timeout: T });
if (await page.locator('input[name=rating]').count()) {
  await page.locator('label[for=rating-5]').click();
  await page.fill('textarea[name=body]', 'Clear and practical. (automated test review)');
  await page.getByRole('button', { name: 'Post review' }).click();
  await page.waitForTimeout(3000);
}
await shot('6-order-reviewed');
await browser.close();
