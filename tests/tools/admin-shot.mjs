import { chromium } from '@playwright/test';
const [,, email, urls] = process.argv;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0,300)); });
if (email) {
  await page.goto('http://127.0.0.1:3031/login');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'ringo1234!');
  await page.click('button[type=submit]');
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60000 });
}
for (const u of urls.split(',')) {
  const res = await page.goto('http://127.0.0.1:3031' + u, { waitUntil: 'load', timeout: 300000 });
  const name = u.replace(/[^a-z0-9]/gi, '_') || 'root';
  await page.screenshot({ path: `/tmp/claude-0/shots/${name}.png`, fullPage: true });
  console.log(u, res?.status());
}
await browser.close();
