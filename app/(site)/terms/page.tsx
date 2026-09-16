import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";

export const metadata: Metadata = { title: "Terms of Service" };

export default async function TermsPage() {
  const { t } = await getT();
  const settings = await getSettings(await getDb());
  return (
    <main className="shell sf-page">
      <article className="sf-prose mx-auto">
        <p className="sf-kicker">{t("Legal", "약관")}</p>
        <h1 className="sf-h1">{t("Terms of Service", "이용약관")}</h1>
        <div className="sf-notice sf-notice-warn !my-6">{t("Placeholder — the full Terms of Service will be published by Ringo’s operating company before launch. This page does not yet contain the binding terms.", "안내 — 정식 이용약관은 서비스 운영사가 출시 전에 게시할 예정입니다. 현재 이 페이지에는 효력이 있는 약관 전문이 포함되어 있지 않습니다.")}</div>
        <h2>{t("What this page will cover", "게시 예정 내용")}</h2>
        <p>{t("Account registration, buying digital products and services, payments, delivery, refunds, seller obligations, prohibited content and dispute handling.", "회원 가입, 디지털 상품·서비스 구매, 결제, 제공 방식, 환불, 판매자 의무, 금지 콘텐츠, 분쟁 처리 등.")}</p>
        <h2>{t("Current refund window", "현재 환불 요청 기간")}</h2>
        <p>{t(`Buyers can request a refund from the order page within ${settings.commerce.refundWindowDays} days of payment. Each request is reviewed.`, `구매자는 결제일로부터 ${settings.commerce.refundWindowDays}일 이내에 주문 상세 페이지에서 환불을 요청할 수 있으며, 요청은 개별 검토됩니다.`)}</p>
        <h2>{t("Questions", "문의")}</h2>
        <p>{t("Contact us through ", "문의는 ")}<Link href="/account/inquiries/new" className="sf-link">{t("Help & support", "고객센터")}</Link>{t(` or ${settings.site.supportEmail}.`, ` 또는 ${settings.site.supportEmail}으로 보내주세요.`)}</p>
        {settings.site.businessInfo && <p className="!mt-8 whitespace-pre-line text-sm text-[#6b7065]">{settings.site.businessInfo}</p>}
      </article>
    </main>
  );
}
