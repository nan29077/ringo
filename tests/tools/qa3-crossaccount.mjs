// Cross-account integration checks (2026-09-19 review).
// Each check drives buyer / seller / admin sessions at once and reports whether a reported defect
// still reproduces. Run it against a FRESH database — the checks buy products and change product
// statuses, so a second run on the same data reports false negatives.
// Each check reproduces one reported defect end to end across buyer / seller / admin sessions.
// Usage: CHROMIUM_PATH=/opt/pw-browsers/chromium BASE_URL=http://127.0.0.1:3090 node tests/tools/qa3-crossaccount.mjs
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3090';
const T = 90000;
const stamp = Date.now().toString(36);
const results = [];
const record = (id, confirmed, detail) => {
  results.push({ id, confirmed, detail });
  console.log(`${confirmed ? '🔴 재현됨' : '🟢 재현 안 됨'}  ${id} — ${detail}`);
};
const note = (m) => console.log(`   · ${m}`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
async function session(name) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => console.error(`[${name}] pageerror ${e.message.slice(0, 140)}`));
  return page;
}
async function login(page, email, password = 'ringo1234!') {
  await page.goto(`${BASE}/login`, { timeout: T });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: T }), page.click('button[type=submit]')]);
}
const toast = (p) => p.locator('[data-sonner-toast]').last().innerText({ timeout: 12000 }).catch(() => '');

/** Buys `slug` as the signed-in buyer, optionally with a coupon. Returns the order id. */
async function buy(page, slug, coupon) {
  await page.goto(`${BASE}/checkout?product=${slug}${coupon ? `&coupon=${coupon}` : ''}`, { timeout: T });
  if (coupon) {
    const field = page.locator('input[name=code]');
    if (await field.count()) {
      await field.fill(coupon);
      await page.getByRole('button', { name: /Apply|적용/ }).first().click().catch(() => {});
      await page.waitForTimeout(1200);
    }
  }
  await page.check('input[name=terms]');
  await Promise.all([page.waitForURL((u) => u.pathname.startsWith('/pay/test/'), { timeout: T }), page.getByRole('button', { name: /^Pay |결제하기/ }).first().click()]);
  const orderId = await page.locator('a[href^="/account/orders/"]').first().getAttribute('href').catch(() => null);
  return { payUrl: page.url(), orderId: orderId?.split('/').pop() ?? null };
}
async function completeTestPayment(page) {
  const btn = page.getByRole('button', { name: /Approve test payment|테스트 결제 승인/ }).first();
  if (!(await btn.count())) { console.log(`   ! 결제 승인 버튼 없음: ${page.url()}`); return false; }
  await btn.click();
  await page.waitForTimeout(3000);
  return true;
}

const buyer = await session('buyer');
const seller = await session('seller');
const admin = await session('admin');

try {
  await Promise.all([login(buyer, 'buyer@ringo.local'), login(seller, 'studio@ringo.local'), login(admin, 'admin@ringo.local')]);
  note('세 계정 로그인 완료');

  // Two published products from the demo seller, needed for the coupon check.
  await seller.goto(`${BASE}/seller/products`, { timeout: T });
  const productLinks = await seller.locator('main table a[href^="/seller/products/"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  note(`판매자 상품 ${productLinks.length}건`);

  // ── CHECK 1: coupon total-usage limit bypassed by stacking unpaid orders ──────────────────
  const code = `QA${stamp.toUpperCase()}`.slice(0, 12);
  await seller.goto(`${BASE}/seller/coupons/new`, { timeout: T });
  await seller.fill('input[name=code]', code);
  await seller.fill('input[name=name]', 'QA limit test');
  await seller.fill('input[name=value]', '50');
  await seller.fill('input[name=usageLimit]', '1');
  await seller.fill('input[name=perUserLimit]', '1');
  await seller.locator('form button[type=submit], form button:not([type])').last().click();
  note(`쿠폰 생성: ${code} → ${(await toast(seller)).slice(0, 60)}`);

  // The buyer stacks two unpaid orders that each pass the limit check, then pays both.
  const slugs = [];
  await buyer.goto(`${BASE}/?sort=featured`, { timeout: T });
  const cards = await buyer.locator('a[href^="/p/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
  for (const href of cards) {
    const s = href.split('/').pop();
    await buyer.goto(`${BASE}/p/${s}`, { timeout: T });
    const body = await buyer.locator('main').innerText();
    if (/Buy now|바로 구매/.test(body) && !/already own|이미 보유/i.test(body)) slugs.push(s);
    if (slugs.length >= 2) break;
  }
  if (slugs.length < 2) {
    record('C1-쿠폰한도', false, `구매 가능한 상품을 2개 찾지 못해 검증 불가 (${slugs.length}개)`);
  } else {
    const a = await buy(buyer, slugs[0], code);
    const b = await buy(buyer, slugs[1], code);
    note(`대기 주문 2건 생성 (${slugs[0]}, ${slugs[1]})`);
    await buyer.goto(a.payUrl, { timeout: T });
    await completeTestPayment(buyer);
    await buyer.goto(b.payUrl, { timeout: T });
    await completeTestPayment(buyer);
    await seller.goto(`${BASE}/seller/coupons`, { timeout: T });
    const row = await seller.locator('main').innerText();
    const m = row.match(new RegExp(`${code}[\\s\\S]{0,400}?(\\d+)\\s*/\\s*1`));
    const used = m ? Number(m[1]) : null;
    record('C1-쿠폰한도', used != null && used > 1, `총 사용 한도 1회 쿠폰의 사용 횟수 = ${used ?? '읽기 실패'} (1을 넘으면 우회 성립)`);
  }

  // ── CHECK 2: a rejected product can be put back on sale by the seller alone ───────────────
  const target = productLinks.find(Boolean);
  if (!target) {
    record('C2-반려우회', false, '판매자 상품이 없어 검증 불가');
  } else {
    const pid = target.split('/').pop();
    await seller.goto(`${BASE}${target}`, { timeout: T });
    const pause = seller.getByRole('button', { name: '판매 일시중지' });
    if (await pause.count()) { await pause.click(); await toast(seller); }
    await seller.goto(`${BASE}${target}`, { timeout: T });
    const submit = seller.getByRole('button', { name: /심사 요청|다시 심사 요청/ });
    if (await submit.count()) { await submit.first().click(); await toast(seller); }
    // Admin rejects it.
    await admin.goto(`${BASE}/admin/products/${pid}`, { timeout: T });
    const reason = admin.locator('textarea[name=reason], input[name=reason]').first();
    if (await reason.count()) await reason.fill('QA 반려 테스트');
    const rejectBtn = admin.getByRole('button', { name: /^반려$/ }).first();
    if (await rejectBtn.count()) { await rejectBtn.click(); note(`관리자 반려: ${(await toast(admin)).slice(0, 50)}`); }
    // Seller tries archive → draft → resume.
    await seller.goto(`${BASE}${target}`, { timeout: T });
    const arch = seller.getByRole('button', { name: '보관하기' });
    if (await arch.count()) { await arch.click(); await toast(seller); }
    await seller.goto(`${BASE}${target}`, { timeout: T });
    const restore = seller.getByRole('button', { name: '임시저장으로 복원' });
    if (await restore.count()) { await restore.click(); await toast(seller); }
    await seller.goto(`${BASE}${target}`, { timeout: T });
    const resume = seller.getByRole('button', { name: '판매 재개' });
    const canResume = await resume.count();
    let published = false;
    if (canResume) {
      await resume.click();
      const msg = await toast(seller);
      await seller.goto(`${BASE}${target}`, { timeout: T });
      published = /판매중/.test(await seller.locator('main').innerText());
      note(`판매 재개 결과: ${msg.slice(0, 60)}`);
    }
    record('C2-반려우회', !!canResume && published, canResume ? `반려된 상품을 판매자가 재심사 없이 판매중으로 되돌림 (성공=${published})` : '판매 재개 버튼이 노출되지 않음');
  }

  // ── CHECK 3: a review written before a refund stays public afterwards ─────────────────────
  await buyer.goto(`${BASE}/account/orders`, { timeout: T });
  const orderHrefs = await buyer.locator('a[href^="/account/orders/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
  let reviewed = null;
  for (const href of orderHrefs) {
    await buyer.goto(`${BASE}${href}`, { timeout: T });
    if (!(await buyer.locator('#rating-5').count())) continue;
    const slugLink = await buyer.locator('a[href^="/p/"]').first().getAttribute('href').catch(() => null);
    await buyer.locator('label[for="rating-5"]').click();
    await buyer.fill('textarea[name=body]', `QA 구매평 ${stamp}`);
    await buyer.getByRole('button', { name: /리뷰 등록|Post review/ }).first().click();
    const msg = await toast(buyer);
    note(`구매평 등록 (${href}): ${msg.slice(0, 50)}`);
    reviewed = { href, slugLink };
    break;
  }
  if (!reviewed) record('C3-환불후구매평', false, '리뷰 작성 가능한 주문을 찾지 못해 검증 불가');
  else {
    const oid = reviewed.href.split('/').pop();
    await admin.goto(`${BASE}/admin/orders/${oid}`, { timeout: T });
    const r = admin.locator('textarea[name=reason], input[name=reason]').first();
    if (await r.count()) await r.fill('QA 환불 테스트');
    const refund = admin.getByRole('button', { name: /환불 승인|강제 환불|환불 처리|수동 환불/ }).first();
    if (!(await refund.count())) record('C3-환불후구매평', false, '관리자 환불 버튼을 찾지 못해 검증 불가');
    else {
      await refund.click();
      const rm = await toast(admin);
      note(`관리자 환불: ${rm.slice(0, 60)}`);
      await admin.goto(`${BASE}/admin/orders/${oid}`, { timeout: T });
      const refunded = /환불 완료/.test(await admin.locator('main').innerText());
      if (!refunded) record('C3-환불후구매평', false, `환불이 완료되지 않아 검증 불가 (${rm.slice(0, 40)})`);
      else if (!reviewed.slugLink) record('C3-환불후구매평', false, '상품 페이지 링크를 찾지 못함');
      else {
        const anon = await (await browser.newContext()).newPage();
        await anon.goto(`${BASE}${reviewed.slugLink}`, { timeout: T });
        const visible = (await anon.locator('main').innerText()).includes(`QA 구매평 ${stamp}`);
        record('C3-환불후구매평', visible, visible ? '환불 완료 후에도 구매평이 상품 페이지에 그대로 노출되고 평점에 반영됨' : '환불 후 구매평이 내려감');
      }
    }
  }

  // ── CHECK 4: admin-only pages without their own permission check ──────────────────────────
  const probes = ['/admin', '/admin/products', '/admin/orders'];
  const leaks = [];
  for (const p of probes) {
    const res = await seller.request.get(`${BASE}${p}`, { headers: { RSC: '1' } });
    const text = await res.text();
    const looksAdmin = /관리자|전체 매출|회원|플랫폼 수수료/.test(text) && !/forbidden|권한이 없습니다/.test(text);
    if (res.status() === 200 && looksAdmin) leaks.push(`${p} (${res.status()}, ${text.length}B)`);
  }
  record('C4-관리자권한', leaks.length > 0, leaks.length ? `판매자 세션의 RSC 요청이 관리자 데이터를 반환: ${leaks.join(', ')}` : '판매자 세션으로는 관리자 페이지 데이터를 얻지 못함');

  // ── CHECK 5: a payment started before suspension still completes ──────────────────────────
  await buyer.goto(`${BASE}/`, { timeout: T });
  const more = await buyer.locator('a[href^="/p/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
  let picked = null;
  for (const href of more) {
    const s = href.split('/').pop();
    await buyer.goto(`${BASE}/p/${s}`, { timeout: T });
    const body = await buyer.locator('main').innerText();
    if (/Buy now|바로 구매/.test(body) && !/already own|이미 보유/i.test(body)) { picked = s; break; }
  }
  if (!picked) record('C5-정지중결제', false, '구매 가능한 상품을 찾지 못해 검증 불가');
  else {
    const pending = await buy(buyer, picked);
    note(`결제 대기 주문 생성 (${picked})`);
    await admin.goto(`${BASE}/admin/products?q=${encodeURIComponent(picked)}`, { timeout: T });
    let suspended = false;
    const adminProd = await admin.locator('main table a[href^="/admin/products/"]').first().getAttribute('href').catch(() => null);
    if (adminProd) {
      await admin.goto(`${BASE}${adminProd}`, { timeout: T });
      const r2 = admin.locator('textarea[name=reason], input[name=reason]').first();
      if (await r2.count()) await r2.fill('QA 정지 테스트');
      const susp = admin.getByRole('button', { name: /판매 중지|판매중지|정지/ }).first();
      if (await susp.count()) { await susp.click(); note(`상품 정지: ${(await toast(admin)).slice(0, 50)}`); suspended = true; }
    }
    if (!suspended) record('C5-정지중결제', false, '상품 정지 버튼을 찾지 못해 검증 불가');
    else {
      await buyer.goto(pending.payUrl, { timeout: T });
      const approved = await completeTestPayment(buyer);
      // The sandbox page carries no link back to the order, so read the newest order from the list.
      await buyer.goto(`${BASE}/account/orders`, { timeout: T });
      const newest = await buyer.locator('a[href^="/account/orders/"]').first().getAttribute('href');
      await buyer.goto(`${BASE}${newest}`, { timeout: T });
      const detail = await buyer.locator('main').innerText();
      const body = detail.slice(detail.indexOf('Orders') + 6);
      const becamePaid = /결제 완료|Paid|Delivered|Download|다운로드/.test(body) && !/Awaiting payment|결제 대기|Expired|만료/.test(body.slice(0, 200));
      record('C5-정지중결제', becamePaid, `상품 정지 후 대기 주문 결제 — 승인버튼=${approved}, 주문이 결제완료가 됨=${becamePaid}`);
    }
  }
} catch (err) {
  console.error(`\n예외: ${err.stack || err}`);
}

await browser.close();
console.log('\n════ 요약 ════');
for (const r of results) console.log(`${r.confirmed ? '재현됨   ' : '재현안됨 '} ${r.id}`);
