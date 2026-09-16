import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, BadgeCheck, BookOpen, Brush, Download, Link2, PackageOpen, Wallet } from "lucide-react";
import { getViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { ApplyForm } from "./apply-form";

export const metadata: Metadata = { title: "Sell on Ringo", description: "Open a store on Ringo and sell eBooks, courses, design resources and creative services." };
export const dynamic = "force-dynamic";

export default async function SellPage() {
  const viewer = await getViewer();
  if (viewer?.seller && viewer.seller.status !== "active") redirect("/sell/status");
  const { t } = await getT();
  const settings = await getSettings(await getDb());
  const commission = (settings.commerce.defaultCommissionBps / 100).toFixed(settings.commerce.defaultCommissionBps % 100 ? 1 : 0);

  const kinds = [
    { icon: Download, title: t("Downloads", "다운로드 상품"), body: t("eBooks, templates, presets and design resources.", "전자책, 템플릿, 프리셋, 디자인 리소스.") },
    { icon: BookOpen, title: t("Courses", "강의"), body: t("Lesson-based courses with free preview lessons.", "미리보기 강의를 포함한 목차형 강의.") },
    { icon: Brush, title: t("Creative services", "제작 서비스"), body: t("Made-to-order work with briefs, due dates and delivery.", "요청서, 납기, 납품까지 관리하는 주문 제작.") },
    { icon: PackageOpen, title: t("Collections", "기획전 패키지"), body: t("Bundles of files curated around a theme.", "주제별로 구성한 파일 묶음 패키지.") },
  ];
  const steps = [
    { title: t("Apply", "입점 신청"), body: t("Tell us about your store and what you make.", "스토어와 판매할 상품을 소개해 주세요.") },
    { title: t("Get approved", "심사 · 승인"), body: t("Our team reviews applications, usually within 2 business days.", "운영팀이 신청서를 검토합니다. 보통 영업일 기준 2일 이내.") },
    { title: t("List products", "상품 등록"), body: t("Upload files, set prices and submit products for review.", "파일을 올리고 가격을 정한 뒤 상품 심사를 요청하세요.") },
    { title: t("Get paid", "정산 받기"), body: t(`Payouts for orders past the ${settings.commerce.refundWindowDays}-day refund window.`, `${settings.commerce.refundWindowDays}일 환불 기간이 지난 주문을 정산합니다.`) },
  ];

  let panel: React.ReactNode;
  if (!viewer) {
    panel = (
      <div className="grid gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{t("Start your application", "입점 신청 시작하기")}</h2>
        <p className="text-sm leading-relaxed text-[#6f716a]">{t("Log in or create a free Ringo account to apply. It takes about five minutes.", "로그인하거나 무료 계정을 만든 뒤 신청하세요. 5분 정도 걸립니다.")}</p>
        <Link href="/login?next=/sell" className="mt-2 flex h-12 items-center justify-center gap-2 rounded-lg bg-[#ed4b2e] text-[15px] font-semibold text-white hover:bg-[#d9401f]">{t("Log in to apply", "로그인하고 신청하기")}<ArrowRight size={16} /></Link>
        <Link href="/signup?next=/sell" className="flex h-12 items-center justify-center rounded-lg border border-[#dfdfd9] text-[15px] font-medium hover:bg-[#f6f5f1]">{t("Create an account", "회원가입")}</Link>
      </div>
    );
  } else if (viewer.seller?.status === "active") {
    panel = (
      <div className="grid gap-3">
        <BadgeCheck className="text-[#16794a]" size={32} />
        <h2 className="text-xl font-semibold tracking-tight">{t(`${viewer.seller.displayName} is open for business`, `${viewer.seller.displayName} 스토어가 운영 중입니다`)}</h2>
        <p className="text-sm text-[#6f716a]">{t("Manage products, orders and payouts in the seller center.", "판매자 센터에서 상품, 주문, 정산을 관리하세요.")}</p>
        <Link href="/seller" className="mt-2 flex h-12 items-center justify-center gap-2 rounded-lg bg-[#1c1d22] text-[15px] font-semibold text-white hover:bg-black">{t("Open seller center", "판매자 센터로 이동")}<ArrowRight size={16} /></Link>
      </div>
    );
  } else if (viewer.user.role === "admin") {
    panel = <p className="text-sm text-[#6f716a]">{t("Operator accounts cannot open a store. Use a separate account to sell.", "운영자 계정으로는 입점할 수 없습니다. 별도 계정을 사용하세요.")}</p>;
  } else {
    panel = (
      <>
        <h2 className="text-xl font-semibold tracking-tight">{t("Seller application", "입점 신청서")}</h2>
        <p className="!mb-6 !mt-1 text-sm text-[#6f716a]">{t(`Signed in as ${viewer.user.email}`, `${viewer.user.email} 계정으로 신청합니다`)}</p>
        <ApplyForm t={t} submitLabel={t("Submit application", "입점 신청하기")} />
      </>
    );
  }

  return (
    <main className="bg-[#faf9f6]">
      <section className="mx-auto grid max-w-[1200px] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_480px] lg:py-20">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#ed4b2e]">{t("Sell on Ringo", "링고에서 판매하기")}</p>
          <h1 className="!mt-4 text-[40px] font-semibold leading-[1.08] tracking-[-0.03em] text-[#1c1d22] sm:text-[52px]">{t("Turn what you make into a store.", "당신이 만든 것을 스토어로.")}</h1>
          <p className="!mt-5 max-w-[560px] text-[17px] leading-relaxed text-[#55574f]">{t("Ringo handles checkout, secure file delivery, refunds and payouts, so you can focus on the work.", "결제, 안전한 파일 전달, 환불, 정산은 링고가 맡습니다. 당신은 작업에만 집중하세요.")}</p>

          <div className="mt-8 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full border border-[#e4e3de] bg-white px-4 py-2"><b>{commission}%</b> {t("commission per sale", "판매 수수료")}</span>
            <span className="rounded-full border border-[#e4e3de] bg-white px-4 py-2">{t("No monthly fee", "월 이용료 없음")}</span>
            <span className="rounded-full border border-[#e4e3de] bg-white px-4 py-2"><Link2 size={14} className="mr-1 inline" />{t("Trackable deep links & coupons", "딥링크 · 쿠폰 마케팅")}</span>
          </div>

          <h2 className="!mt-12 text-sm font-semibold uppercase tracking-[0.08em] text-[#8a8c84]">{t("What you can sell", "판매할 수 있는 상품")}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {kinds.map((k) => (
              <div key={k.title} className="rounded-xl border border-[#ebeae4] bg-white p-5">
                <k.icon size={22} className="text-[#ed4b2e]" />
                <h3 className="!mt-3 font-semibold text-[#1c1d22]">{k.title}</h3>
                <p className="!mt-1 text-sm leading-relaxed text-[#6f716a]">{k.body}</p>
              </div>
            ))}
          </div>

          <h2 className="!mt-12 text-sm font-semibold uppercase tracking-[0.08em] text-[#8a8c84]">{t("How it works", "진행 과정")}</h2>
          <ol className="mt-4 grid gap-4 sm:grid-cols-2">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#1c1d22] text-sm font-semibold text-white">{i + 1}</span>
                <div>
                  <h3 className="font-semibold text-[#1c1d22]">{s.title}</h3>
                  <p className="!mt-0.5 text-sm leading-relaxed text-[#6f716a]">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="!mt-10 flex items-center gap-2 text-sm text-[#6f716a]"><Wallet size={16} />{t("Payouts via bank transfer, GCash, Maya or PayPal.", "은행 송금, GCash, Maya, PayPal로 정산받을 수 있습니다.")}</p>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <div id="apply" className="rounded-2xl border border-[#ebeae4] bg-white p-6 shadow-[0_20px_60px_#1c1d220d] sm:p-8">{panel}</div>
        </div>
      </section>
    </main>
  );
}
