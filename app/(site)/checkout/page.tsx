import Link from "next/link";
import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { AlertTriangle, ArrowLeft, Library, Lock, Tag } from "lucide-react";
import * as s from "@/db/schema";
import { requireViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { mediaUrl } from "@/lib/server/storage";
import { one, type SP } from "@/lib/server/list";
import { CommerceError, validateCoupon } from "@/lib/server/commerce";
import { errorMessage } from "@/lib/server/action";
import { paymentOptions } from "@/lib/server/checkout";
import { activeEntitlement, isPurchasable, pick, productBySlug } from "@/lib/server/storefront";
import { formatMoney } from "@/lib/i18n";
import { label, deliveryType } from "@/lib/status";
import { BusyButton, RedirectForm } from "@/components/store/redirect-form";
import { PaymentMethods } from "./payment-methods";
import { placeOrder } from "./actions";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

function Message({ title, body, action }: { title: string; body?: string; action: React.ReactNode }) {
  return (
    <main className="access shell">
      <AlertTriangle size={40} aria-hidden />
      <h1>{title}</h1>
      {body && <p>{body}</p>}
      {action}
    </main>
  );
}

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const slug = one(sp, "product");
  const couponParam = one(sp, "coupon").trim().toUpperCase().slice(0, 40);
  const self = `/checkout?product=${encodeURIComponent(slug)}${couponParam ? `&coupon=${encodeURIComponent(couponParam)}` : ""}`;
  const viewer = await requireViewer(self);
  const { t, lang } = await getT();
  const db = await getDb();
  const row = slug ? await productBySlug(db, slug) : null;
  if (!row || !isPurchasable(row)) {
    return <Message title={t("This product is not available", "구매할 수 없는 상품입니다")} body={t("It may have been removed from sale or the link is incorrect.", "판매가 중단되었거나 잘못된 링크일 수 있습니다.")} action={<Link href="/#catalog" className="sf-btn sf-btn-outline">{t("Browse the catalog", "전체 상품 보기")}</Link>} />;
  }
  const { product: p, seller } = row;
  const service = p.deliveryType === "service";
  if (seller.userId === viewer.user.id) {
    return <Message title={t("You can’t buy your own product", "본인 상품은 구매할 수 없습니다")} action={<Link href={`/p/${p.slug}`} className="sf-btn sf-btn-outline">{t("Back to product", "상품으로 돌아가기")}</Link>} />;
  }
  if (!service && (await activeEntitlement(db, viewer.user.id, p.id))) {
    return (
      <main className="access shell">
        <Library size={40} aria-hidden />
        <h1>{t("You already own this", "이미 보유한 상품입니다")}</h1>
        <p>{t("It’s waiting in your library.", "라이브러리에서 바로 이용할 수 있어요.")}</p>
        <Link href={p.deliveryType === "course" ? `/account/library/${p.id}` : "/account/library"} className="sf-btn sf-btn-primary">{t("Open library", "라이브러리 열기")}</Link>
      </main>
    );
  }

  const settings = await getSettings(db);
  let discountCents = 0;
  let couponError: string | null = null;
  let appliedCoupon: string | null = null;
  if (couponParam) {
    try {
      const v = await validateCoupon(db, couponParam, p, viewer.user.id);
      discountCents = v.discountCents;
      appliedCoupon = v.coupon.code;
    } catch (err) {
      if (!(err instanceof CommerceError)) throw err;
      couponError = await errorMessage(err.code);
    }
  }
  const totalCents = p.priceCents - discountCents;
  const options = paymentOptions(settings.payments.enabledProviders, t);
  const canPay = totalCents === 0 || options.some((o) => o.available);
  const [pending] = await db
    .select({ id: s.orders.id, orderNo: s.orders.orderNo })
    .from(s.orders)
    .where(and(eq(s.orders.buyerId, viewer.user.id), eq(s.orders.productId, p.id), eq(s.orders.status, "pending_payment")))
    .orderBy(desc(s.orders.createdAt))
    .limit(1);

  const title = pick(lang, p.titleEn, p.titleKo);
  const money = (c: number) => formatMoney(c, p.currency, lang);
  let step = 1;

  return (
    <main className="shell sf-page">
      <Link href={`/p/${p.slug}`} className="inline-flex items-center gap-2 text-sm text-[#6b7065] hover:text-[#20211f]"><ArrowLeft size={16} aria-hidden />{t("Back to product", "상품으로 돌아가기")}</Link>
      <div className="sf-head !mt-4">
        <div>
          <p className="sf-kicker">{t("Secure checkout", "안전한 결제")}</p>
          <h1>{t("Checkout", "결제하기")}</h1>
        </div>
      </div>

      {pending && (
        <div className="sf-notice sf-notice-info mb-6" role="status">
          <AlertTriangle aria-hidden />
          <div>{t(`You have an unpaid order (${pending.orderNo}) for this product.`, `이 상품에 결제 대기 중인 주문(${pending.orderNo})이 있습니다.`)} <Link className="sf-link" href={`/checkout/${pending.id}`}>{t("Complete that order instead", "기존 주문 결제하기")}</Link></div>
        </div>
      )}

      <div className="sf-checkout">
        <div className="grid gap-5">
          <section className="sf-card sf-card-pad" aria-labelledby="item-title">
            <div className="sf-step"><b>{step++}</b><h2 id="item-title" className="sf-h2">{t("Your order", "주문 상품")}</h2></div>
            <div className="flex items-center gap-4">
              <img src={mediaUrl(p.coverKey)} alt="" className="sf-thumb sf-thumb-lg" />
              <div className="min-w-0 flex-1">
                <Link href={`/p/${p.slug}`} className="block text-[17px] font-semibold text-[#20211f] hover:underline">{title}</Link>
                <p className="!mt-1 text-sm text-[#6b7065]">{seller.displayName} · {label(deliveryType, p.deliveryType, lang)}{p.formatLabel ? ` · ${p.formatLabel}` : ""}</p>
                {service && <p className="!mt-1 text-sm text-[#6b7065]">{t(`Delivered within ${p.deliveryDays ?? 7} days of payment`, `결제 후 ${p.deliveryDays ?? 7}일 이내 납품`)}</p>}
              </div>
              <strong className="text-[17px]">{money(p.priceCents)}</strong>
            </div>
          </section>

          <section className="sf-card sf-card-pad" aria-labelledby="coupon-title">
            <div className="sf-step"><b>{step++}</b><h2 id="coupon-title" className="sf-h2">{t("Coupon", "쿠폰")}</h2></div>
            <form method="get" action="/checkout" className="flex flex-wrap items-end gap-2.5">
              <input type="hidden" name="product" value={p.slug} />
              <label className="sf-field min-w-[200px] flex-1">
                <span className="sr-only">{t("Coupon code", "쿠폰 코드")}</span>
                <input name="coupon" defaultValue={couponParam} className="sf-input uppercase" placeholder={t("Enter a coupon code", "쿠폰 코드를 입력하세요")} maxLength={40} autoComplete="off" aria-invalid={!!couponError} aria-describedby="coupon-status" />
              </label>
              <button className="sf-btn sf-btn-outline h-11"><Tag aria-hidden />{t("Apply", "적용")}</button>
              {appliedCoupon && <Link href={`/checkout?product=${encodeURIComponent(p.slug)}`} className="sf-btn sf-btn-ghost h-11">{t("Remove", "삭제")}</Link>}
            </form>
            <div id="coupon-status" aria-live="polite">
              {appliedCoupon && <p className="!mt-3 text-sm font-semibold text-[#1f6a3d]">{t(`${appliedCoupon} applied — you save ${money(discountCents)}.`, `${appliedCoupon} 쿠폰 적용 · ${money(discountCents)} 할인`)}</p>}
              {couponError && <p className="!mt-3 text-sm font-semibold text-[#b8362a]">{couponError}</p>}
            </div>
          </section>

          <RedirectForm action={placeOrder} className="grid gap-5">
            <input type="hidden" name="productId" value={p.id} />
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            {appliedCoupon && <input type="hidden" name="coupon" value={appliedCoupon} />}

            {service && (
              <section className="sf-card sf-card-pad" aria-labelledby="brief-title">
                <div className="sf-step"><b>{step++}</b><h2 id="brief-title" className="sf-h2">{t("Your brief", "제작 요청 내용")}</h2></div>
                <label className="sf-field">
                  <span>{t("What should the creator make? (required)", "무엇을 제작하면 될까요? (필수)")}</span>
                  <textarea name="brief" required minLength={10} maxLength={4000} className="sf-textarea !min-h-[160px]" placeholder={t("Describe your brand, audience, goals, sizes/formats, deadline and any references.", "브랜드, 대상 고객, 목표, 필요한 사이즈·형식, 일정, 참고 자료 등을 알려주세요.")} />
                  <small>{t("You can add details later by messaging the seller from your order.", "주문 후에도 판매자 문의로 추가 내용을 전달할 수 있습니다.")}</small>
                </label>
              </section>
            )}

            {totalCents > 0 && (
              <section className="sf-card sf-card-pad">
                <PaymentMethods options={options} t={t} step={step++} />
              </section>
            )}

            <section className="sf-card sf-card-pad grid gap-4">
              <label className="sf-check">
                <input type="checkbox" name="terms" required />
                <span>
                  {t("I agree to the ", "")}<Link href="/terms" target="_blank" className="sf-link">{t("Terms of Service", "이용약관")}</Link>{t(" and ", " 및 ")}<Link href="/privacy" target="_blank" className="sf-link">{t("Privacy Policy", "개인정보 처리방침")}</Link>{t(`. I understand digital content is available immediately, and refunds can be requested within ${settings.commerce.refundWindowDays} days.`, `에 동의합니다. 디지털 콘텐츠는 결제 즉시 제공되며, 환불은 ${settings.commerce.refundWindowDays}일 이내에 요청할 수 있음을 확인합니다.`)}
                </span>
              </label>
              <BusyButton className="sf-btn sf-btn-primary sf-btn-lg sf-btn-block" busyLabel={t("Processing…", "처리 중…")}>
                <Lock size={17} aria-hidden />
                {totalCents === 0 ? t("Get it free", "무료로 받기") : t(`Pay ${money(totalCents)}`, `${money(totalCents)} 결제하기`)}
              </BusyButton>
              {!canPay && <p className="text-center text-sm text-[#b8362a]">{t("No payment method is available right now.", "현재 사용 가능한 결제 수단이 없습니다.")}</p>}
              <p className="text-center text-[13px] text-[#6b7065]">{t(`Receipt will be sent to ${viewer.user.email}`, `영수증은 ${viewer.user.email}(으)로 발송됩니다`)}</p>
            </section>
          </RedirectForm>
        </div>

        <aside className="sf-summary sf-card sf-card-pad" aria-labelledby="summary-title">
          <h2 id="summary-title" className="sf-h2 !mb-3">{t("Order summary", "결제 금액")}</h2>
          <div className="sf-line"><span>{t("Subtotal", "상품 금액")}</span><span>{money(p.priceCents)}</span></div>
          {p.compareAtCents != null && p.compareAtCents > p.priceCents && <div className="sf-line text-[#6b7065]"><span>{t("Regular price", "정가")}</span><s>{money(p.compareAtCents)}</s></div>}
          <div className="sf-line"><span>{t("Coupon discount", "쿠폰 할인")}{appliedCoupon ? ` (${appliedCoupon})` : ""}</span><span className={discountCents ? "text-[#1f6a3d]" : ""}>{discountCents ? `−${money(discountCents)}` : money(0)}</span></div>
          <div className="sf-line sf-line-total"><span>{t("Total", "총 결제 금액")}</span><span>{money(totalCents)}</span></div>
          <p className="!mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-[#6b7065]"><Lock size={15} className="mt-0.5" aria-hidden />{t("Prices are confirmed on our server when you place the order. You’ll be redirected to the payment provider to finish.", "주문 시 서버에서 금액을 다시 확인하며, 결제는 결제사 화면에서 완료됩니다.")}</p>
        </aside>
      </div>
    </main>
  );
}
