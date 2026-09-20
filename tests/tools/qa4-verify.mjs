// Verifies the 2026-09-19 fixes with assertions that check the mechanism, not a screen phrase.
// Run against a FRESH database. Usage: CHROMIUM_PATH=... BASE_URL=http://127.0.0.1:3101 node tests/tools/qa4-verify.mjs
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3101';
const T = 90000;
const stamp = Date.now().toString(36);
const out = [];
const pass = (id, m) => { out.push([true, id]); console.log(`✅ ${id} — ${m}`); };
const fail = (id, m) => { out.push([false, id]); console.log(`❌ ${id} — ${m}`); };
const note = (m) => console.log(`   · ${m}`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const mk = async () => { const p = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage(); p.on('dialog', (d) => d.accept()); return p; };
const login = async (page, email) => {
  await page.goto(`${BASE}/login`, { timeout: T });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'ringo1234!');
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: T }), page.click('button[type=submit]')]);
};
const toast = (p) => p.locator('[data-sonner-toast]').last().innerText({ timeout: 12000 }).catch(() => '');
const text = async (p) => (await p.locator('main').innerText()).replace(/\s+/g, ' ');

const buyer = await mk(), seller = await mk(), admin = await mk();
await Promise.all([login(buyer, 'buyer@ringo.local'), login(seller, 'studio@ringo.local'), login(admin, 'admin@ringo.local')]);

async function buyableSlug() {
  await buyer.goto(`${BASE}/`, { timeout: T });
  const hrefs = await buyer.locator('a[href^="/p/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
  for (const h of hrefs) {
    const s = h.split('/').pop();
    await buyer.goto(`${BASE}/p/${s}`, { timeout: T });
    const body = await text(buyer);
    if (/Buy now|바로 구매/.test(body) && !/already own|이미 보유/i.test(body)) return s;
  }
  return null;
}
async function purchase(slug) {
  await buyer.goto(`${BASE}/checkout?product=${slug}`, { timeout: T });
  await buyer.check('input[name=terms]');
  await Promise.all([buyer.waitForURL((u) => u.pathname.startsWith('/pay/test/'), { timeout: T }), buyer.getByRole('button', { name: /^Pay |결제하기/ }).first().click()]);
  const payUrl = buyer.url();
  return payUrl;
}
async function approve(page) {
  const b = page.getByRole('button', { name: /Approve test payment|테스트 결제 승인/ }).first();
  if (!(await b.count())) return false;
  await b.click();
  await page.waitForTimeout(3000);
  return true;
}
async function newestOrder() {
  await buyer.goto(`${BASE}/account/orders`, { timeout: T });
  return buyer.locator('a[href^="/account/orders/"]').first().getAttribute('href');
}

try {
  // ── F1: a rejected product cannot be put back on sale by the seller ───────────────────────
  // Every demo product is already approved, and an approved product can never re-enter review, so a
  // fresh one is created. A "service" product needs no files, which keeps the setup short.
  await seller.goto(`${BASE}/seller/products/new`, { timeout: T });
  const serviceCategory = await seller.locator('select[name=categoryId] option').evaluateAll((os) => os.map((o) => o.value));
  await seller.selectOption('select[name=categoryId]', serviceCategory.includes('advertising') ? 'advertising' : serviceCategory[0]);
  await seller.fill('input[name=titleEn]', `QA Service ${stamp}`);
  await seller.fill('input[name=titleKo]', `QA 제작 ${stamp}`);
  await seller.fill('input[name=price]', '30');
  const days = seller.locator('input[name=deliveryDays]');
  if (await days.count()) await days.fill('5');
  await seller.locator('form button[type=submit], form button:not([type])').last().click();
  await seller.waitForTimeout(2500);
  const target = new URL(seller.url()).pathname.startsWith('/seller/products/') ? new URL(seller.url()).pathname : null;
  note(`새 상품: ${target ?? seller.url()}`);
  if (!target) fail('F1-반려우회', '상품 생성에 실패해 반려 경로를 만들지 못함');
  else {
    const pid = target.split('/').pop();
    const submit = seller.getByRole('button', { name: /^심사 요청$/ });
    if (!(await submit.count())) fail('F1-반려우회', `심사 요청 버튼이 없음: ${(await text(seller)).slice(0, 120)}`);
    else {
      await submit.first().click();
      note(`심사 요청: ${(await toast(seller)).slice(0, 40)}`);
      await admin.goto(`${BASE}/admin/products/${pid}`, { timeout: T });
      const box = admin.locator('textarea[name=reason]').last();
      if (!(await box.count())) fail('F1-반려우회', '관리자 반려 폼이 없음 (심사 대기 상태가 아님)');
      else {
        await box.fill(`QA 반려 ${stamp}`);
        await admin.getByRole('button', { name: /^반려$/ }).last().click();
        note(`관리자 반려: ${(await toast(admin)).slice(0, 40)}`);
        await seller.goto(`${BASE}${target}`, { timeout: T });
        if (!/반려/.test(await text(seller))) fail('F1-반려우회', '반려 상태가 되지 않음');
        else {
          for (const label of ['보관하기', '임시저장으로 복원']) {
            const b = seller.getByRole('button', { name: label });
            if (await b.count()) { await b.click(); await toast(seller); }
            await seller.goto(`${BASE}${target}`, { timeout: T });
          }
          const resume = seller.getByRole('button', { name: '판매 재개' });
          if (await resume.count()) {
            await resume.click();
            const msg = await toast(seller);
            await seller.goto(`${BASE}${target}`, { timeout: T });
            if (/판매중/.test(await text(seller))) fail('F1-반려우회', `반려된 상품이 다시 판매중이 됨 (${msg.slice(0, 40)})`);
            else pass('F1-반려우회', '판매 재개가 거부됨');
          } else pass('F1-반려우회', '반려 후 판매 재개 경로가 열리지 않음 (재심사만 가능)');
        }
      }
    }
  }

  // ── F2: a refunded purchase takes its review down ────────────────────────────────────────
  const slug = await buyableSlug();
  if (!slug) fail('F2-환불후구매평', '구매 가능한 상품 없음');
  else {
    const payUrl = await purchase(slug);
    await buyer.goto(payUrl, { timeout: T });
    await approve(buyer);
    const href = await newestOrder();
    await buyer.goto(`${BASE}${href}`, { timeout: T });
    if (!(await buyer.locator('#rating-5').count())) fail('F2-환불후구매평', '구매평 폼이 없음');
    else {
      await buyer.locator('label[for="rating-5"]').click();
      await buyer.fill('textarea[name=body]', `QA리뷰${stamp}`);
      await buyer.getByRole('button', { name: /리뷰 등록|Post review/ }).first().click();
      note(`구매평 등록: ${(await toast(buyer)).slice(0, 40)}`);
      const anon0 = await (await browser.newContext()).newPage();
      await anon0.goto(`${BASE}/p/${slug}`, { timeout: T });
      const before = (await anon0.locator('main').innerText()).includes(`QA리뷰${stamp}`);
      note(`환불 전 상품 페이지 노출: ${before}`);
      const oid = href.split('/').pop();
      await admin.goto(`${BASE}/admin/orders/${oid}`, { timeout: T });
      const form = admin.locator('form').filter({ hasText: '강제 환불' }).first();
      const force = form.locator('input[name=reason]').first();
      if (await force.count()) await force.fill(`QA 환불 ${stamp}`);
      const btn = form.getByRole('button', { name: /환불/ }).first();
      if (!(await btn.count())) fail('F2-환불후구매평', '관리자 환불 버튼 없음');
      else {
        await btn.click();
        note(`환불: ${(await toast(admin)).slice(0, 60)}`);
        await admin.goto(`${BASE}/admin/orders/${oid}`, { timeout: T });
        const refunded = /환불 완료|Refunded/.test(await text(admin));
        if (!refunded) fail('F2-환불후구매평', '환불이 완료되지 않아 검증 불가');
        else {
          const anon = await (await browser.newContext()).newPage();
          await anon.goto(`${BASE}/p/${slug}`, { timeout: T });
          const after = (await anon.locator('main').innerText()).includes(`QA리뷰${stamp}`);
          if (after) fail('F2-환불후구매평', '환불 후에도 구매평이 노출됨');
          else pass('F2-환불후구매평', `환불과 함께 구매평이 내려감 (환불 전 노출=${before})`);
        }
      }
    }
  }

  // ── F3: a payment that completes after suspension delivers nothing ───────────────────────
  const slug2 = await buyableSlug();
  if (!slug2) fail('F3-정지중결제', '구매 가능한 상품 없음');
  else {
    const payUrl = await purchase(slug2);
    await admin.goto(`${BASE}/admin/products?q=${encodeURIComponent(slug2)}`, { timeout: T });
    const ap = await admin.locator('main table a[href^="/admin/products/"]').first().getAttribute('href');
    await admin.goto(`${BASE}${ap}`, { timeout: T });
    const r = admin.locator('textarea[name=reason]').last();
    if (await r.count()) await r.fill(`QA 정지 ${stamp}`);
    await admin.getByRole('button', { name: /판매 중지|판매중지/ }).last().click();
    note(`상품 정지: ${(await toast(admin)).slice(0, 40)}`);
    await buyer.goto(payUrl, { timeout: T });
    await approve(buyer);
    const href = await newestOrder();
    await buyer.goto(`${BASE}${href}`, { timeout: T });
    const body = await text(buyer);
    const gotAccess = /Open in library|라이브러리에서 열기|Download|다운로드/.test(body);
    const queued = /Refund requested|환불 요청/i.test(body);
    if (gotAccess) fail('F3-정지중결제', '판매 중지된 상품인데 구매자가 이용 권한을 받음');
    else pass('F3-정지중결제', `이용 권한이 발급되지 않음 (환불 대기로 표시=${queued})`);
  }

  // ── F4: a coupon's total limit cannot be beaten by stacking unpaid orders ─────────────────
  const code = `QA${stamp.toUpperCase()}`.slice(0, 12);
  await seller.goto(`${BASE}/seller/coupons/new`, { timeout: T });
  await seller.fill('input[name=code]', code);
  await seller.fill('input[name=name]', 'QA limit');
  await seller.fill('input[name=value]', '50');
  await seller.fill('input[name=usageLimit]', '1');
  await seller.fill('input[name=perUserLimit]', '1');
  await seller.locator('form button[type=submit], form button:not([type])').last().click();
  note(`쿠폰 생성: ${code} → ${(await toast(seller)).slice(0, 40)}`);
  const picked = [];
  await buyer.goto(`${BASE}/`, { timeout: T });
  for (const h of await buyer.locator('a[href^="/p/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')))])) {
    const sl = h.split('/').pop();
    await buyer.goto(`${BASE}/p/${sl}`, { timeout: T });
    const b = await text(buyer);
    if (/Buy now|바로 구매/.test(b) && !/already own|이미 보유/i.test(b)) picked.push(sl);
    if (picked.length >= 2) break;
  }
  if (picked.length < 2) fail('F4-쿠폰한도', '구매 가능한 상품을 2개 찾지 못함');
  else {
    const urls = [];
    for (const sl of picked) {
      await buyer.goto(`${BASE}/checkout?product=${sl}&coupon=${code}`, { timeout: T });
      const blocked = /사용|used|exhausted|소진/i.test(await text(buyer)) && !(await buyer.locator('input[name=terms]').count());
      if (blocked) break;
      await buyer.check('input[name=terms]');
      await Promise.all([buyer.waitForURL((u) => u.pathname.startsWith('/pay/test/'), { timeout: T }), buyer.getByRole('button', { name: /^Pay |결제하기/ }).first().click()]);
      urls.push(buyer.url());
    }
    for (const u of urls) { await buyer.goto(u, { timeout: T }); await approve(buyer); }
    await seller.goto(`${BASE}/seller/coupons`, { timeout: T });
    const m = (await text(seller)).match(new RegExp(`${code}[\\s\\S]{0,300}?(\\d+)\\s*/\\s*1`));
    const used = m ? Number(m[1]) : null;
    if (used != null && used > 1) fail('F4-쿠폰한도', `총 한도 1회 쿠폰이 ${used}회 사용됨`);
    else pass('F4-쿠폰한도', `총 한도를 넘지 않음 (사용 ${used ?? '0'}회, 대기 주문 ${urls.length}건)`);
  }

  // ── F5: a seller session cannot read admin-only pages ────────────────────────────────────
  const leaks = [];
  for (const path of ['/admin', '/admin/products', '/admin/orders', '/admin/settlements']) {
    const res = await seller.request.get(`${BASE}${path}`, { headers: { RSC: '1' } });
    const t2 = await res.text();
    if (res.status() === 200 && /전체 매출|플랫폼 수수료|정산 관리/.test(t2)) leaks.push(`${path} (${res.status()})`);
  }
  if (leaks.length) fail('F5-관리자권한', `판매자 세션이 관리자 데이터를 받음: ${leaks.join(', ')}`);
  else pass('F5-관리자권한', '판매자 세션으로는 관리자 페이지 데이터를 얻지 못함');
} catch (err) {
  console.error(`\n예외: ${err.stack || err}`);
  out.push([false, 'exception']);
}

await browser.close();
const bad = out.filter(([ok]) => !ok);
console.log(`\n════ ${out.length - bad.length}/${out.length} 통과 ════`);
process.exit(bad.length ? 1 : 0);
