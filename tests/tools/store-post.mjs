// After a purchase: order page (paid banner), course progress toggle, review.
// node tests/tools/store-post.mjs <email> <product title>
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [,, email, title] = process.argv;
const base = 'http://127.0.0.1:3031';
const dir = '/tmp/claude-0/shots/store/flow';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.setDefaultTimeout(120000);
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
const shot = async (name) => { await page.screenshot({ path: `${dir}/post-${name}.png`, fullPage: true }); console.log('shot', name, page.url()); };
await page.goto(`${base}/login`);
await page.fill('input[name=email]', email);
await page.fill('input[name=password]', 'ringo1234!');
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.startsWith('/login'));
await page.goto(`${base}/account/orders`, { waitUntil: 'networkidle' });
const href = await page.getByRole('link', { name: title }).first().getAttribute('href');
await page.goto(`${base}${href}?paid=1`, { waitUntil: 'networkidle' });
await shot('order-paid');
await page.goto(`${base}/account/library`, { waitUntil: 'networkidle' });
await page.getByRole('link', { name: /Open course|Continue course/ }).first().click();
await page.waitForURL(u => /\/account\/library\/.+/.test(u.pathname));
await page.waitForLoadState('networkidle');
const boxes = page.locator('input[type=checkbox]');
await boxes.nth(0).check();
await page.waitForTimeout(3000);
await boxes.nth(1).check();
await page.waitForTimeout(3000);
await page.reload({ waitUntil: 'networkidle' });
console.log('progress text:', await page.locator('[role=progressbar]').first().getAttribute('aria-valuenow'));
await shot('course');
await page.goto(`${base}${href}`, { waitUntil: 'networkidle' });
if (await page.locator('input[name=rating]').count()) {
  await page.locator('label[for=rating-5]').click();
  await page.fill('textarea[name=body]', 'Clear, practical lessons. (automated test review)');
  await page.getByRole('button', { name: 'Post review' }).click();
  await page.waitForTimeout(4000);
  await page.reload({ waitUntil: 'networkidle' });
}
await shot('order-reviewed');
await browser.close();
