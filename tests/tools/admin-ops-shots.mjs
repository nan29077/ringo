// Screenshots of admin detail pages reached by clicking through lists (read-only).
import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:3031';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(150000);
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`${BASE}/login`);
await page.fill('input[name=email]', 'admin@ringo.local');
await page.fill('input[name=password]', 'ringo1234!');
await page.click('button[type=submit]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'));
const shot = (n) => page.screenshot({ path: `/tmp/claude-0/shots/detail_${n}.png`, fullPage: true });
const open = async (list, linkText, name) => {
  await page.goto(BASE + list, { waitUntil: 'networkidle' });
  const href = await page.locator('table a', { hasText: linkText }).first().getAttribute('href');
  await page.goto(BASE + href, { waitUntil: 'networkidle' });
  console.log(name, page.url());
  await shot(name);
};
await open('/admin/orders?q=Coastal', 'RG-DEMO', 'order_refund_requested');
await open('/admin/orders/fulfillment', 'RG-DEMO', 'order_service');
await open('/admin/sellers', 'Form & Field', 'seller');
for (const u of process.env.EXPORTS ? ['/admin/orders/export', '/admin/members/export', '/admin/settlements/export?status=paid'] : []) {
  const r = await page.request.get(BASE + u, { timeout: 150000 });
  console.log(u, r.status(), r.headers()['content-type'], (await r.text()).split('\r\n').length - 1, 'rows');
}
await page.setViewportSize({ width: 390, height: 844 });
for (const u of ['/admin/orders', '/admin/settlements']) {
  await page.goto(BASE + u, { waitUntil: 'networkidle' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log('mobile', u, 'horizontal overflow px:', overflow);
  await page.screenshot({ path: `/tmp/claude-0/shots/mobile${u.replace(/\//g, '_')}.png` });
}
await browser.close();
