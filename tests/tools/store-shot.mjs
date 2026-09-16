// Storefront screenshots: node tests/tools/store-shot.mjs <email|""> "<url,url>" [width]
// Saves to /tmp/claude-0/shots/store/<name>[-w<width>]-<n>.png, split into viewport-height chunks.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [,, email, urls, widthArg] = process.argv;
const width = Number(widthArg || 1440);
const dir = '/tmp/claude-0/shots/store';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 300)); });
if (email) {
  await page.goto('http://127.0.0.1:3031/login', { timeout: 400000 });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'ringo1234!');
  await page.click('button[type=submit]');
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 400000 });
}
for (const u of urls.split(',')) {
  const res = await page.goto('http://127.0.0.1:3031' + u, { waitUntil: 'load', timeout: 400000 });
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  const name = (u.replace(/[^a-z0-9]/gi, '_') || 'root') + (width !== 1440 ? `-w${width}` : '');
  await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } window.scrollTo(0, 0); });
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const chunk = width < 600 ? 1600 : 1800;
  for (let i = 0, y = 0; y < h && i < 6; i++, y += chunk) {
    await page.screenshot({ path: `${dir}/${name}-${i}.png`, fullPage: true, clip: { x: 0, y, width, height: Math.min(chunk, h - y) } });
  }
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  console.log(u, res?.status(), 'final:', page.url(), 'height', h, sw > width ? `HSCROLL ${sw}` : '');
}
await browser.close();
