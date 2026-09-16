import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Clock, ShieldAlert, XCircle } from "lucide-react";
import { requireViewer } from "@/lib/server/auth";
import { getT } from "@/lib/server/i18n-server";
import { formatDate } from "@/lib/i18n";
import { ApplyForm } from "../apply-form";

export const metadata: Metadata = { title: "Seller application status", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SellStatusPage() {
  const viewer = await requireViewer("/sell/status");
  const seller = viewer.seller;
  if (!seller) redirect("/sell");
  if (seller.status === "active") redirect("/seller");
  const { t, lang } = await getT();

  const card = "rounded-2xl border border-[#ebeae4] bg-white p-6 shadow-[0_20px_60px_#1c1d220d] sm:p-8";
  return (
    <main className="bg-[#faf9f6] px-4 py-14">
      <div className="mx-auto grid max-w-[640px] gap-6">
        {seller.status === "pending" && (
          <div className={card}>
            <Clock className="text-[#a45c00]" size={32} />
            <h1 className="!mt-4 text-[26px] font-semibold tracking-tight text-[#1c1d22]">{t("Your application is under review", "입점 신청을 검토하고 있습니다")}</h1>
            <p className="!mt-2 text-sm leading-relaxed text-[#6f716a]">{t(`We received the application for "${seller.displayName}" and will email ${viewer.user.email} once it has been reviewed.`, `"${seller.displayName}" 신청서를 접수했습니다. 심사가 끝나면 ${viewer.user.email}로 안내드립니다.`)}</p>
            <dl className="mt-6 grid grid-cols-[120px_1fr] gap-y-2 border-t border-[#efeee9] pt-5 text-sm">
              <dt className="text-[#8a8c84]">{t("Store", "스토어")}</dt><dd>{seller.displayName} · /s/{seller.slug}</dd>
              <dt className="text-[#8a8c84]">{t("Submitted", "신청일")}</dt><dd>{formatDate(seller.updatedAt, lang, true)}</dd>
              <dt className="text-[#8a8c84]">{t("Status", "상태")}</dt><dd><span className="rounded-full bg-[#fff4e0] px-2 py-0.5 text-xs font-semibold text-[#a45c00]">{t("In review", "심사 중")}</span></dd>
            </dl>
            <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-lg border border-[#dfdfd9] px-5 text-sm font-medium hover:bg-[#f6f5f1]">{t("Back to Ringo", "링고 홈으로")}</Link>
          </div>
        )}

        {seller.status === "suspended" && (
          <div className={card}>
            <ShieldAlert className="text-[#c0362c]" size={32} />
            <h1 className="!mt-4 text-[26px] font-semibold tracking-tight text-[#1c1d22]">{t("Your store is suspended", "스토어 운영이 정지되었습니다")}</h1>
            <p className="!mt-2 text-sm leading-relaxed text-[#6f716a]">{t("Selling and the seller center are unavailable while your store is suspended. Contact support to learn more or to appeal.", "정지 기간에는 판매와 판매자 센터 이용이 제한됩니다. 자세한 내용이나 이의 제기는 고객센터로 문의하세요.")}</p>
            <Link href="/account/inquiries" className="mt-6 inline-flex h-11 items-center rounded-lg bg-[#1c1d22] px-5 text-sm font-semibold text-white hover:bg-black">{t("Contact support", "고객센터 문의")}</Link>
          </div>
        )}

        {seller.status === "rejected" && (
          <>
            <div className={card}>
              <XCircle className="text-[#c0362c]" size={32} />
              <h1 className="!mt-4 text-[26px] font-semibold tracking-tight text-[#1c1d22]">{t("Your application was not approved", "입점 신청이 승인되지 않았습니다")}</h1>
              {seller.rejectReason && (
                <div className="mt-4 rounded-lg border border-[#f7c9c7] bg-[#fff3f2] px-4 py-3 text-sm text-[#a3302a]">
                  <b>{t("Reason", "사유")}</b>
                  <p className="!mt-1 whitespace-pre-wrap">{seller.rejectReason}</p>
                </div>
              )}
              <p className="!mt-4 text-sm leading-relaxed text-[#6f716a]">{t("Update your application below and submit it again.", "아래 신청서를 수정해 다시 제출할 수 있습니다.")}</p>
            </div>
            <div className={card}>
              <h2 className="!mb-6 text-xl font-semibold tracking-tight">{t("Re-apply", "다시 신청하기")}</h2>
              <ApplyForm t={t} seller={seller} submitLabel={t("Submit again", "다시 신청하기")} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
