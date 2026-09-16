import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const lang of ['en','ko']) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 800 } });
  await ctx.addCookies([{ name: 'ringo-lang', value: lang, url: 'http://127.0.0.1:3033' }]);
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:3033/', { waitUntil: 'networkidle' });
  await p.screenshot({ path: `/tmp/claude-0/shots/home-${lang}.png` });
}
await b.close();
