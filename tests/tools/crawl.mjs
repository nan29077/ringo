// Crawl internal links as a role and report HTTP errors, runtime errors and console errors.
import { chromium } from '@playwright/test';
const [,, email, startCsv, prefixCsv, maxArg] = process.argv;
const BASE = 'http://127.0.0.1:3031';
const max = Number(maxArg || 150);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();
let current = '';
const problems = [];
page.on('pageerror', e => problems.push(`[pageerror] ${current}: ${e.message.slice(0, 200)}`));
page.on('console', m => { if (m.type() === 'error' && !/favicon|width\(-1\)|Download the React DevTools/.test(m.text())) problems.push(`[console] ${current}: ${m.text().slice(0, 200)}`); });
if (email) {
  await page.goto(BASE + '/login');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'ringo1234!');
  await page.click('button[type=submit]');
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 90000 });
}
const prefixes = prefixCsv.split(',');
const queue = startCsv.split(',');
const seen = new Set(queue);
let visited = 0;
const norm = (href) => { const u = new URL(href, BASE); if (u.origin !== BASE) return null; u.hash = ''; return u.pathname + u.search; };
while (queue.length && visited < max) {
  const path = queue.shift();
  current = path;
  visited++;
  let res;
  try { res = await page.goto(BASE + path, { waitUntil: 'load', timeout: 120000 }); } catch (e) { problems.push(`[timeout] ${path}`); continue; }
  const status = res?.status();
  const body = await page.innerText('body').catch(() => '');
  if (!status || status >= 400) problems.push(`[http ${status}] ${path}`);
  if (/Unhandled Runtime Error|Application error: a server-side exception|Internal Server Error|This page could not be found/.test(body)) problems.push(`[error-text] ${path}`);
  const links = await page.$$eval('a[href]', as => as.map(a => a.getAttribute('href')));
  for (const l of links) {
    if (!l || l.startsWith('mailto:') || /export|\/api\/|download|\/l\/|\/media\//.test(l)) continue;
    const n = norm(l); if (!n) continue;
    const pathOnly = n.split('?')[0];
    if (!prefixes.some(p => pathOnly === p || pathOnly.startsWith(p + '/') || (p === '/' && pathOnly === '/'))) continue;
    // limit query-variants per path
    const key = n.includes('?') ? pathOnly + '?*' : n;
    if (seen.has(n) || seen.has(key)) continue;
    seen.add(n); seen.add(key); queue.push(n);
  }
}
console.log(`visited ${visited}, queued-left ${queue.length}`);
console.log(problems.length ? problems.join('\n') : 'NO PROBLEMS');
await browser.close();
