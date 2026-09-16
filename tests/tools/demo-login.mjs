import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [label, expect] of [['최고 관리자 테스트 로그인','/admin'],['판매자 테스트 로그인','/seller'],['구매자 테스트 로그인','/account']]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addCookies([{ name: 'ringo-lang', value: 'ko', url: 'http://127.0.0.1:3031' }]);
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:3031/login', { waitUntil: 'networkidle', timeout: 180000 });
  if (expect === '/admin') await p.screenshot({ path: '/tmp/claude-0/shots/login-demo.png', fullPage: true });
  await Promise.all([p.waitForURL(u => u.pathname.startsWith(expect), { timeout: 180000 }), p.getByRole('button', { name: new RegExp(label) }).click()]);
  console.log(label, '->', new URL(p.url()).pathname);
  await ctx.close();
}
await b.close();
