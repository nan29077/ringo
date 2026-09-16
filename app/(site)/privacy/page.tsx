import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";

export const metadata: Metadata = { title: "Privacy Policy" };

export default async function PrivacyPage() {
  const { t } = await getT();
  const settings = await getSettings(await getDb());
  return (
    <main className="shell sf-page">
      <article className="sf-prose mx-auto">
        <p className="sf-kicker">{t("Legal", "약관")}</p>
        <h1 className="sf-h1">{t("Privacy Policy", "개인정보 처리방침")}</h1>
        <div className="sf-notice sf-notice-warn !my-6">{t("Placeholder — the full Privacy Policy will be published by Ringo’s operating company before launch. This page does not yet contain the binding policy.", "안내 — 정식 개인정보 처리방침은 서비스 운영사가 출시 전에 게시할 예정입니다. 현재 이 페이지에는 효력이 있는 방침 전문이 포함되어 있지 않습니다.")}</div>
        <h2>{t("What this page will cover", "게시 예정 내용")}</h2>
        <p>{t("Which personal information is collected, why it is used, how long it is kept, who it is shared with (such as payment providers and sellers fulfilling your order), and how to exercise your rights.", "수집하는 개인정보 항목, 이용 목적, 보관 기간, 제3자 제공(결제사, 주문을 처리하는 판매자 등), 이용자 권리 행사 방법 등.")}</p>
        <h2>{t("Your account", "내 계정")}</h2>
        <p>{t("You can review and update your name, language and email preferences on your ", "이름, 언어, 이메일 수신 설정은 ")}<Link href="/account/profile" className="sf-link">{t("profile page", "프로필 페이지")}</Link>{t(".", "에서 확인하고 변경할 수 있습니다.")}</p>
        <h2>{t("Questions", "문의")}</h2>
        <p>{t(`Contact ${settings.site.supportEmail}.`, `${settings.site.supportEmail}으로 문의하세요.`)}</p>
      </article>
    </main>
  );
}
