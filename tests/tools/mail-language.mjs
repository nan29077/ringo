// Transactional mail follows the recipient's account language: English by default, Korean when the
// account is set to Korean. Checks the rendered subjects in the admin email log.
// Usage: CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/tools/mail-language.mjs
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3031';
const T = 60000;
const errors = [];
let step = 0;
const ok = (m) => console.log(`✔ ${++step}. ${m}`);
const fail = (m) => { console.error(`✘ ${m}`); errors.push(m); };
const stamp = Date.now().toString(36);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const admin = await (await browser.newContext()).newPage();
const user = await (await browser.newContext()).newPage();
admin.on('pageerror', (e) => fail(`pageerror ${e.message}`));

async function login(page, email, password = 'ringo1234!') {
  await page.goto(`${BASE}/login`, { timeout: T });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: T }), page.click('button[type=submit]')]);
}
/** Subjects recorded in the admin email log for an address, newest first. */
async function subjectsFor(email) {
  await admin.goto(`${BASE}/admin/messages?q=${encodeURIComponent(email)}`, { timeout: T });
  return admin.locator('main table tbody tr').evaluateAll((trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ')));
}

try {
  await login(admin, 'admin@ringo.local');
  ok('signed in as admin');

  // 1. A new account defaults to English.
  const email = `mail-${stamp}@example.com`;
  await user.goto(`${BASE}/signup`, { timeout: T });
  await user.fill('input[name=name]', 'Mail Language QA');
  await user.fill('input[name=email]', email);
  await user.fill('input[name=password]', `Passw0rd!${stamp}`);
  await user.check('input[name=terms]');
  await Promise.all([user.waitForURL((u) => u.pathname.startsWith('/account'), { timeout: T }), user.click('button[type=submit]')]);
  let rows = await subjectsFor(email);
  if (!rows.some((r) => /Verify your Ringo email/.test(r))) fail(`English verification mail missing: ${rows.join(' | ')}`);
  else ok('new account receives the English verification email');

  // 2. Switching the account language to Korean switches the mail.
  await user.goto(`${BASE}/account/profile`, { timeout: T });
  await user.selectOption('select[name=locale]', 'ko');
  await user.locator('form').filter({ has: user.locator('select[name=locale]') }).locator('button[type=submit], button:not([type])').last().click();
  await user.waitForTimeout(2500);
  // The "resend verification" button lives on the account overview.
  await user.goto(`${BASE}/account`, { timeout: T });
  const resend = user.getByRole('button', { name: /인증 메일 다시 받기|Resend email/i }).first();
  if (!(await resend.count())) fail('no resend-verification button on the profile page');
  else {
    await resend.click();
    await user.waitForTimeout(2500);
    rows = await subjectsFor(email);
    if (!rows.some((r) => /링고 이메일 인증/.test(r))) fail(`Korean verification mail missing: ${rows.join(' | ')}`);
    else ok('after switching to Korean the same email arrives in Korean');
  }

  // 3. Templates render without leftover placeholders.
  await admin.goto(`${BASE}/admin/messages`, { timeout: T });
  const all = await admin.locator('main').innerText();
  if (/undefined|\[object Object\]|\$\{/.test(all)) fail('email log contains an unrendered placeholder');
  else ok('no unrendered placeholders in the email log');
} catch (err) {
  fail(`exception: ${err.stack || err}`);
}
await browser.close();
console.log(errors.length ? `\nFAILED (${errors.length})\n${errors.join('\n')}` : '\nALL CHECKS PASSED');
process.exit(errors.length ? 1 : 0);
