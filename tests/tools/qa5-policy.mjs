// Checks the three policy decisions applied on 2026-09-19.
// Run against a FRESH database. Usage: CHROMIUM_PATH=... BASE_URL=http://127.0.0.1:3121 node tests/tools/qa5-policy.mjs
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3121';
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
const body = async (p) => (await p.locator('body').innerText()).replace(/\s+/g, ' ');

const buyer = await mk(), seller = await mk(), admin = await mk();
await Promise.all([login(buyer, 'buyer@ringo.local'), login(seller, 'studio@ringo.local'), login(admin, 'admin@ringo.local')]);

try {
  // ── P1: changing what buyers receive on a LIVE product raises a flag, selling continues ──────
  await seller.goto(`${BASE}/seller/products`, { timeout: T });
  const links = await seller.locator('main table a[href^="/seller/products/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
  let live = null;
  for (const href of links) {
    await seller.goto(`${BASE}${href}`, { timeout: T });
    if (/판매중/.test(await body(seller)) && (await seller.getByRole('button', { name: '판매 일시중지' }).count())) { live = href; break; }
  }
  if (!live) fail('P1-콘텐츠변경', '판매중인 상품을 찾지 못함');
  else {
    const pid = live.split('/').pop();
    const res = await seller.request.post(`${BASE}/api/uploads`, {
      multipart: { kind: 'product-asset', productId: pid, file: { name: `extra-${stamp}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% QA extra file\n') } },
    });
    note(`판매 중 파일 추가: ${res.status()}`);
    if (!res.ok()) fail('P1-콘텐츠변경', `파일 추가가 거부됨 (${res.status()})`);
    else {
      // The product must still be on sale.
      await seller.goto(`${BASE}${live}`, { timeout: T });
      const stillSelling = /판매중/.test(await body(seller));
      // The operator must see it.
      await admin.goto(`${BASE}/admin/products/${pid}`, { timeout: T });
      const flagged = /콘텐츠 변경|전달되는 내용/.test(await body(admin));
      if (!stillSelling) fail('P1-콘텐츠변경', '파일 변경으로 판매가 중단됨 (의도와 다름)');
      else if (!flagged) fail('P1-콘텐츠변경', '관리자 화면에 변경 표식이 없음');
      else {
        const ack = admin.getByRole('button', { name: /변경 확인 완료/ }).first();
        if (!(await ack.count())) fail('P1-콘텐츠변경', '확인 처리 버튼이 없음');
        else {
          await ack.click();
          note(`확인 처리: ${(await toast(admin)).slice(0, 40)}`);
          await admin.goto(`${BASE}/admin/products/${pid}`, { timeout: T });
          const cleared = !/전달되는 내용/.test(await body(admin));
          if (cleared) pass('P1-콘텐츠변경', '판매는 계속되고, 관리자에게 표식이 뜬 뒤 확인 처리로 사라짐');
          else fail('P1-콘텐츠변경', '확인 처리 후에도 표식이 남음');
        }
      }
    }
  }

  // ── P2: unread badges follow who wrote last, and clear when the thread is opened ─────────────
  await buyer.goto(`${BASE}/account/inquiries/new`, { timeout: T }).catch(() => {});
  let created = false;
  if (await buyer.locator('input[name=subject]').count()) {
    await buyer.fill('input[name=subject]', `QA 문의 ${stamp}`);
    await buyer.fill('textarea[name=body]', '읽음 표시 확인용 문의입니다.');
    await buyer.locator('form button[type=submit], form button:not([type])').last().click();
    note(`문의 등록: ${(await toast(buyer)).slice(0, 40)}`);
    created = true;
  }
  if (!created) fail('P2-읽음표시', '문의 작성 화면을 찾지 못함');
  else {
    // Platform-routed by default → the admin console badge should count it.
    await admin.goto(`${BASE}/admin/inquiries`, { timeout: T });
    const row = admin.locator('main table a[href^="/admin/inquiries/"]').filter({ hasText: `QA 문의 ${stamp}` }).first();
    if (!(await row.count())) fail('P2-읽음표시', '관리자 목록에서 문의를 찾지 못함');
    else {
      const href = await row.getAttribute('href');
      // The badge is a number, not a phrase: the buyer's account may run in English.
      const badge = async () => {
        await buyer.goto(`${BASE}/account`, { timeout: T });
        const el = buyer.locator('.sf-nav-badge').first();
        return (await el.count()) ? Number((await el.innerText()).trim()) || 0 : 0;
      };
      const before = await badge();
      await admin.goto(`${BASE}${href}`, { timeout: T });
      await admin.fill('textarea[name=body]', `QA 답변 ${stamp}`);
      await admin.locator('form button[type=submit], form button:not([type])').last().click();
      note(`관리자 답변: ${(await toast(admin)).slice(0, 40)}`);
      const afterReply = await badge();
      // Open the thread the admin just answered.
      await buyer.goto(`${BASE}/account/inquiries`, { timeout: T });
      const thread = await buyer.locator('a[href^="/account/inquiries/"]').filter({ hasText: `QA 문의 ${stamp}` }).first().getAttribute('href').catch(() => null);
      if (thread) await buyer.goto(`${BASE}${thread}`, { timeout: T });
      const afterRead = await badge();
      note(`미확인 수: 답변 전 ${before} → 답변 후 ${afterReply} → 열람 후 ${afterRead}`);
      if (afterReply !== before + 1) fail('P2-읽음표시', `답변 후 미확인 수가 1 늘지 않음 (${before} → ${afterReply})`);
      else if (afterRead !== before) fail('P2-읽음표시', `열람 후 미확인 수가 돌아오지 않음 (${afterReply} → ${afterRead})`);
      else pass('P2-읽음표시', `본인 글은 미확인 아님, 답변 시 +1, 열람 시 원복 (${before}→${afterReply}→${afterRead})`);
    }
  }

  // ── P3: the notice audience label states the real reach ──────────────────────────────────────
  await admin.goto(`${BASE}/admin/notices/new`, { timeout: T });
  const form = await body(admin);
  const honest = /비로그인 방문자 포함/.test(form) && /비로그인 방문자도 볼 수 있습니다/.test(form);
  if (honest) pass('P3-공지라벨', '스토어 공지가 비로그인 방문자에게도 보인다는 점이 라벨과 안내문에 명시됨');
  else fail('P3-공지라벨', `라벨이 갱신되지 않음: ${form.slice(0, 200)}`);
} catch (err) {
  console.error(`\n예외: ${err.stack || err}`);
  out.push([false, 'exception']);
}

await browser.close();
const bad = out.filter(([ok]) => !ok);
console.log(`\n════ ${out.length - bad.length}/${out.length} 통과 ════`);
process.exit(bad.length ? 1 : 0);
