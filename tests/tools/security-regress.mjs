// Regression checks for the login open-redirect and rate-limit bypass fixes.
// Usage: BASE_URL=http://127.0.0.1:3031 CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/tools/security-regress.mjs
import { chromium } from '@playwright/test';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3031';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}`); if (!ok) failed++; };

// 1) open redirect on /login?next=
const ctx = await b.newContext();
const p = await ctx.newPage();
await p.goto(`${BASE}/login`, { timeout: 180000 });
await p.fill('input[name=email]', 'admin@ringo.local');
await p.fill('input[name=password]', 'ringo1234!');
await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 180000 }), p.click('button[type=submit]')]);
for (const next of ['/\\evil.com', '/%5Cevil.com', '//evil.com', '/\tevil.com', 'https://evil.com', '/%2F%2Fevil.com']) {
  const res = await ctx.request.get(`${BASE}/login?next=${encodeURIComponent(next)}`, { maxRedirects: 0, timeout: 180000 });
  const loc = res.headers()['location'] || '';
  const target = loc ? new URL(loc, BASE) : null;
  check(!target || target.origin === new URL(BASE).origin, `next=${JSON.stringify(next)} → ${res.status()} ${loc}`);
}
const okRes = await ctx.request.get(`${BASE}/login?next=${encodeURIComponent('/account/orders')}`, { maxRedirects: 0 });
check((okRes.headers()['location'] || '').endsWith('/account/orders'), `legit next=/account/orders → ${okRes.headers()['location']}`);

// 2) rate limit cannot be bypassed by rotating X-Forwarded-For
let blockedAt = 0;
for (let i = 1; i <= 14; i++) {
  const c = await b.newContext({ extraHTTPHeaders: { 'x-forwarded-for': `10.9.${i}.${i}` } });
  const pg = await c.newPage();
  await pg.goto(`${BASE}/login`);
  await pg.fill('input[name=email]', 'buyer@ringo.local');
  await pg.fill('input[name=password]', 'wrong-password-' + i);
  await pg.click('button[type=submit]');
  const text = await pg.locator('[data-sonner-toast]').last().innerText({ timeout: 30000 }).catch(() => '');
  await c.close();
  if (/too many|시도 횟수/i.test(text)) { blockedAt = i; break; }
}
check(blockedAt > 0 && blockedAt <= 11, `rotating XFF wrong-password attempts blocked at attempt #${blockedAt || 'never'}`);
await b.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
