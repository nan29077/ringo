// Checks the fixes from the 2026-09-21 admin/seller QA. Run against a FRESH database.
// Usage: CHROMIUM_PATH=... BASE_URL=http://127.0.0.1:3211 node tests/tools/qa6-verify.mjs
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3211';
const T = 90000;
const stamp = Date.now().toString(36);
const out = [];
const pass = (id, m) => { out.push([true, id]); console.log(`✅ ${id} — ${m}`); };
const fail = (id, m) => { out.push([false, id]); console.log(`❌ ${id} — ${m}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const mk = async () => { const p = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage(); p.on('dialog', (d) => d.accept()); return p; };
const login = async (page, email) => {
  await page.goto(`${BASE}/login`, { timeout: T });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', 'ringo1234!');
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: T }), page.click('button[type=submit]')]);
};
const toast = (p) => p.locator('[data-sonner-toast]').last().innerText({ timeout: 12000 }).catch(() => '');
const text = async (p, sel = 'body') => (await p.locator(sel).first().innerText()).replace(/\s+/g, ' ');
const submit = (p) => p.locator('main form button[type=submit], main form button:not([type])').last().click();

const seller = await mk(), admin = await mk();
await Promise.all([login(seller, 'studio@ringo.local'), login(admin, 'admin@ringo.local')]);

try {
  // ── Menu wording and numeric badges ─────────────────────────────────────────────────────────────
  await admin.goto(`${BASE}/admin`, { timeout: T });
  const aside = await text(admin, 'aside');
  const wantAdmin = ['승인 대기 상품', '제작 요청 주문', '판매자 정산', '판매 링크', '기본 설정', '결제 서비스 설정', '관리자 작업 기록', '오류 기록', '보낸 메일', '방문 경로'];
  const missing = wantAdmin.filter((w) => !aside.includes(w));
  const oldAdmin = ['딥링크', '대기열', '결제 연동', '에러 로그', '관리 작업 로그'].filter((w) => aside.includes(w));
  if (missing.length || oldAdmin.length) fail('메뉴-관리자', `없음: ${missing.join(',')} / 남은 옛 용어: ${oldAdmin.join(',')}`);
  else pass('메뉴-관리자', '쉬운 용어로 바뀜');
  const badges = await admin.locator('aside .rc-new').allInnerTexts();
  if (badges.length && badges.every((b) => /^(\d+|99\+)$/.test(b.trim()))) pass('배지-숫자', `배지: ${badges.join(', ')}`);
  else fail('배지-숫자', `배지 표시: ${JSON.stringify(badges)}`);

  await seller.goto(`${BASE}/seller`, { timeout: T });
  const sAside = await text(seller, 'aside');
  const wantSeller = ['제작할 주문', '정산 내역', '판매 링크', '구매 후기', '정산 받을 계좌'];
  const sMissing = wantSeller.filter((w) => !sAside.includes(w));
  if (sMissing.length || /대기열|딥링크/.test(sAside)) fail('메뉴-판매자', `없음: ${sMissing.join(',')}`);
  else pass('메뉴-판매자', '쉬운 용어로 바뀜');
  // Single-link group lights up on its detail pages too.
  await seller.goto(`${BASE}/seller/inquiries`, { timeout: T });
  const detail = await seller.locator('main a[href^="/seller/inquiries/"]').first().getAttribute('href').catch(() => null);
  if (detail) {
    await seller.goto(`${BASE}${detail}`, { timeout: T });
    const active = await seller.locator('aside a.rc-nav-link.active[href="/seller/inquiries"]').count();
    if (active) pass('메뉴-활성', '문의 상세에서도 고객 문의 메뉴가 선택 상태'); else fail('메뉴-활성', '상세 페이지에서 메뉴 선택 표시가 없음');
  } else fail('메뉴-활성', '문의 상세를 찾지 못함');

  // ── Seller: settlements CSV ─────────────────────────────────────────────────────────────────────
  const csv = await seller.request.get(`${BASE}/seller/settlements/export`);
  const csvText = await csv.text();
  if (csv.ok() && /text\/csv/.test(csv.headers()['content-type'] || '') && csvText.includes('net_payout')) pass('정산-CSV', `${csvText.trim().split('\n').length - 1}행`);
  else fail('정산-CSV', `${csv.status()} ${csv.headers()['content-type']}`);
  const csvAdmin = await admin.request.get(`${BASE}/seller/settlements/export`, { maxRedirects: 0 }).catch(() => null);
  if (csvAdmin && csvAdmin.ok() && /net_payout/.test(await csvAdmin.text())) fail('정산-CSV권한', '판매자가 아닌 계정이 CSV를 받음');
  else pass('정산-CSV권한', '관리자 계정은 판매자 CSV를 받지 못함');

  // ── Seller: link code must be 3+ chars ──────────────────────────────────────────────────────────
  await seller.goto(`${BASE}/seller/links/new`, { timeout: T });
  await seller.locator('select[name=productId]').selectOption({ index: 1 }).catch(() => {});
  await seller.fill('input[name=name]', `QA 링크 ${stamp}`);
  await seller.fill('input[name=source]', 'qa');
  await seller.locator('input[name=code]').evaluate((el) => { el.removeAttribute('minlength'); el.value = 'ab'; });
  await submit(seller);
  const linkMsg = await toast(seller);
  if (/3자 이상/.test(linkMsg)) pass('링크-코드', linkMsg.slice(0, 60)); else fail('링크-코드', `메시지: ${linkMsg}`);

  // ── Seller: coupon with a past end date ─────────────────────────────────────────────────────────
  await seller.goto(`${BASE}/seller/coupons/new`, { timeout: T });
  await seller.fill('input[name=code]', `QA${stamp}`.toUpperCase().slice(0, 20));
  await seller.fill('input[name=name]', 'QA 지난 쿠폰');
  await seller.fill('input[name=value]', '10');
  await seller.fill('input[name=endsAt]', '2020-01-01T10:00');
  await submit(seller);
  const cMsg = await toast(seller);
  if (/종료일이 이미 지났습니다/.test(cMsg)) pass('쿠폰-지난종료일', cMsg.slice(0, 60)); else fail('쿠폰-지난종료일', `메시지: ${cMsg}`);

  // ── Seller: website must be a real address ──────────────────────────────────────────────────────
  await seller.goto(`${BASE}/seller/settings`, { timeout: T });
  const oldSite = await seller.inputValue('input[name=website]');
  await seller.fill('input[name=website]', 'not a url');
  await submit(seller);
  const wMsg = await toast(seller);
  if (/웹사이트/.test(wMsg)) pass('웹사이트-검증', wMsg.slice(0, 60)); else fail('웹사이트-검증', `메시지: ${wMsg}`);
  await seller.goto(`${BASE}/seller/settings`, { timeout: T });
  await seller.fill('input[name=website]', 'example.com');
  await submit(seller);
  const okMsg = await toast(seller);
  if (/저장/.test(okMsg)) pass('웹사이트-정상', '도메인만 입력해도 저장됨'); else fail('웹사이트-정상', `메시지: ${okMsg}`);
  await seller.goto(`${BASE}/seller/settings`, { timeout: T });
  await seller.fill('input[name=website]', oldSite);
  await submit(seller);
  await toast(seller);

  // ── Admin: minimum payout is enforced ───────────────────────────────────────────────────────────
  await admin.goto(`${BASE}/admin/settlements`, { timeout: T });
  const canCreateBefore = await admin.getByText('정산서 생성', { exact: true }).count();
  await admin.goto(`${BASE}/admin/settings`, { timeout: T });
  const minInput = admin.locator('input[name=minPayout]');
  const oldMin = await minInput.inputValue();
  await minInput.fill('999999');
  await minInput.locator('xpath=ancestor::form').locator('button').last().click();
  await toast(admin);
  await admin.goto(`${BASE}/admin/settlements`, { timeout: T });
  const canCreateAfter = await admin.locator('summary', { hasText: '정산서 생성' }).count();
  const belowShown = await admin.getByText(/최소 지급액\(.*\) 미만/).count();
  if (!canCreateBefore) fail('최소지급액', '정산 가능한 판매자가 없어 확인 불가');
  else if (canCreateAfter === 0 && belowShown > 0) pass('최소지급액', `최소 지급액을 올리자 정산서 생성 버튼 ${canCreateBefore}개 → 0개, 미만 안내 ${belowShown}건`);
  else fail('최소지급액', `생성 버튼 ${canCreateAfter}개 남음, 안내 ${belowShown}건`);
  await admin.goto(`${BASE}/admin/settings`, { timeout: T });
  await admin.locator('input[name=minPayout]').fill(oldMin);
  await admin.locator('input[name=minPayout]').locator('xpath=ancestor::form').locator('button').last().click();
  await toast(admin);
} catch (err) {
  console.error(`\n예외: ${err.stack || err}`);
  out.push([false, 'exception']);
}

await browser.close();
const bad = out.filter(([ok]) => !ok);
console.log(`\n════ ${out.length - bad.length}/${out.length} 통과 ════`);
process.exit(bad.length ? 1 : 0);
