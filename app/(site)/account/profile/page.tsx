import { and, desc, eq, gt } from "drizzle-orm";
import { Laptop, ShieldCheck } from "lucide-react";
import * as s from "@/db/schema";
import { requireViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { formatDate } from "@/lib/i18n";
import { ActionButton, ActionForm } from "@/components/common/action-form";
import { AccountHeader, Card } from "@/components/store/account-ui";
import { changePassword, signOutOtherDevices, updateProfile } from "../actions";

export const metadata = { title: "Profile & security" };

/** Short, human description of a user agent string (no external parsing library). */
function describeAgent(ua: string | null, unknown: string) {
  if (!ua) return unknown;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : null;
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : null;
  return [browser, os].filter(Boolean).join(" · ") || ua.slice(0, 60);
}

export default async function ProfilePage() {
  const viewer = await requireViewer("/account/profile");
  const { t, lang } = await getT();
  const db = await getDb();
  const sessions = await db.select().from(s.sessions).where(and(eq(s.sessions.userId, viewer.user.id), gt(s.sessions.expiresAt, new Date()))).orderBy(desc(s.sessions.lastSeenAt));
  const u = viewer.user;
  const others = sessions.filter((x) => x.id !== viewer.sessionId).length;

  return (
    <>
      <AccountHeader title={t("Profile & security", "프로필 · 보안")} description={t("Manage your details, language, password and signed-in devices.", "내 정보, 언어, 비밀번호, 로그인 기기를 관리하세요.")} />
      <div className="grid max-w-[760px] gap-5">
        <Card title={t("Profile", "프로필")} id="profile">
          <ActionForm action={updateProfile} className="grid gap-4">
            <label className="sf-field">
              <span>{t("Email", "이메일")}</span>
              <input value={u.email} readOnly disabled className="sf-input !bg-[#f6f6f3] text-[#6b7065]" />
              <small>{u.emailVerifiedAt ? t(`Verified ${formatDate(u.emailVerifiedAt, lang)}`, `${formatDate(u.emailVerifiedAt, lang)} 인증됨`) : t("Not verified yet — check your inbox or resend from the overview page.", "아직 인증되지 않았습니다. 메일함을 확인하거나 개요 페이지에서 다시 받으세요.")} {t("To change your email, contact support.", "이메일 변경은 고객센터에 문의하세요.")}</small>
            </label>
            <label className="sf-field">
              <span>{t("Name", "이름")}</span>
              <input name="name" defaultValue={u.name} required maxLength={80} autoComplete="name" className="sf-input" />
            </label>
            <label className="sf-field">
              <span>{t("Preferred language", "사용 언어")}</span>
              <select name="locale" defaultValue={u.locale} className="sf-select">
                <option value="en">English</option>
                <option value="ko">한국어</option>
              </select>
              <small>{t("Used for the site and emails.", "사이트와 이메일에 사용됩니다.")}</small>
            </label>
            <label className="sf-check">
              <input type="checkbox" name="marketing" defaultChecked={u.marketingOptIn} />
              <span>{t("Email me about new products, creators and offers. You can unsubscribe any time.", "새로운 상품, 크리에이터, 혜택 소식을 이메일로 받겠습니다. 언제든 해지할 수 있습니다.")}</span>
            </label>
            <button className="sf-btn sf-btn-dark justify-self-start">{t("Save profile", "프로필 저장")}</button>
          </ActionForm>
        </Card>

        <Card title={t("Change password", "비밀번호 변경")} id="password">
          <ActionForm action={changePassword} resetOnSuccess className="grid gap-4">
            <input type="text" name="username" autoComplete="username" value={u.email} readOnly hidden />
            <label className="sf-field">
              <span>{t("Current password", "현재 비밀번호")}</span>
              <input name="current" type="password" required autoComplete="current-password" className="sf-input" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sf-field">
                <span>{t("New password", "새 비밀번호")}</span>
                <input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="sf-input" />
              </label>
              <label className="sf-field">
                <span>{t("Confirm new password", "새 비밀번호 확인")}</span>
                <input name="confirm" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="sf-input" />
              </label>
            </div>
            <p className="text-[13px] text-[#6b7065]">{t("Use 8+ characters with letters and numbers. Changing your password signs you out on other devices.", "영문과 숫자를 포함해 8자 이상 입력하세요. 비밀번호를 변경하면 다른 기기에서 로그아웃됩니다.")}</p>
            <button className="sf-btn sf-btn-dark justify-self-start">{t("Update password", "비밀번호 변경")}</button>
          </ActionForm>
        </Card>

        <Card
          title={t("Signed-in devices", "로그인된 기기")}
          id="sessions"
          pad={false}
          actions={others > 0 ? <ActionButton action={signOutOtherDevices} confirm={t("Sign out of all other devices?", "다른 모든 기기에서 로그아웃할까요?")} className="sf-btn sf-btn-outline sf-btn-sm">{t("Sign out other devices", "다른 기기 로그아웃")}</ActionButton> : undefined}
        >
          <ul className="sf-list">
            {sessions.map((x) => (
              <li key={x.id} className="sf-row">
                <Laptop size={20} className="text-[#7c8570]" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[#20211f]">{describeAgent(x.userAgent, t("Unknown device", "알 수 없는 기기"))} {x.id === viewer.sessionId && <span className="sf-pill sf-pill-green ml-1">{t("This device", "현재 기기")}</span>}</p>
                  <p className="text-[13px] text-[#6b7065]">{t(`Signed in ${formatDate(x.createdAt, lang, true)} · last active ${formatDate(x.lastSeenAt, lang, true)}`, `${formatDate(x.createdAt, lang, true)} 로그인 · 최근 활동 ${formatDate(x.lastSeenAt, lang, true)}`)}{x.ip ? ` · IP ${x.ip}` : ""}</p>
                </div>
              </li>
            ))}
          </ul>
          {others === 0 && <p className="flex items-center gap-2 border-t border-[#efefeb] px-5 py-3 text-[13px] text-[#6b7065]"><ShieldCheck size={15} aria-hidden />{t("You’re only signed in on this device.", "현재 이 기기에서만 로그인되어 있습니다.")}</p>}
        </Card>
      </div>
    </>
  );
}
