import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { AlertTriangle, ArrowLeft, Lock } from "lucide-react";
import * as s from "@/db/schema";
import { requireViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { mediaUrl } from "@/lib/server/storage";
import { one, type SP } from "@/lib/server/list";
import { paymentOptions } from "@/lib/server/checkout";
import { isUuid, pick } from "@/lib/server/storefront";
import { formatDate, formatMoney } from "@/lib/i18n";
import { ActionButton } from "@/components/common/action-form";
import { BusyButton, RedirectForm } from "@/components/store/redirect-form";
import { PaymentMethods } from "../payment-methods";
import { cancelOrder, resumePayment } from "../actions";

export const metadata: Metadata = { title: "Complete payment", robots: { index: false } };

export default async function ResumeCheckout({ params, searchParams }: { params: Promise<{ orderId: string }>; searchParams: Promise<SP> }) {
  const [{ orderId }, sp] = await Promise.all([params, searchParams]);
  const viewer = await requireViewer(`/checkout/${orderId}`);
  if (!isUuid(orderId)) notFound();
  const db = await getDb();
  const { t, lang } = await getT();
  const [row] = await db
    .select({ order: s.orders, product: s.products })
    .from(s.orders)
    .innerJoin(s.products, eq(s.products.id, s.orders.productId))
    .where(and(eq(s.orders.id, orderId), eq(s.orders.buyerId, viewer.user.id)));
  if (!row) notFound();
  const { order, product } = row;
  if (order.status !== "pending_payment") redirect(`/account/orders/${order.id}`);
  const settings = await getSettings(db);
  const options = paymentOptions(settings.payments.enabledProviders, t);
  const [lastPayment] = await db.select().from(s.payments).where(eq(s.payments.orderId, order.id)).orderBy(desc(s.payments.createdAt)).limit(1);
  const expiresAt = new Date(order.createdAt.getTime() + settings.commerce.pendingPaymentMinutes * 60000);
  const money = (c: number) => formatMoney(c, order.currency, lang);
  const cancelled = one(sp, "cancelled") === "1";
  const declined = !cancelled && lastPayment && (lastPayment.status === "failed" || lastPayment.status === "cancelled");

  return (
    <main className="shell sf-page">
      <Link href={`/account/orders/${order.id}`} className="inline-flex items-center gap-2 text-sm text-[#6b7065] hover:text-[#20211f]"><ArrowLeft size={16} aria-hidden />{t("Order details", "주문 상세")}</Link>
      <div className="sf-head !mt-4">
        <div>
          <p className="sf-kicker">{t(`Order ${order.orderNo}`, `주문번호 ${order.orderNo}`)}</p>
          <h1>{t("Complete your payment", "결제를 완료해 주세요")}</h1>
          <p>{t(`Unpaid orders are cancelled automatically after ${formatDate(expiresAt, lang, true)}.`, `${formatDate(expiresAt, lang, true)} 이후 미결제 주문은 자동 취소됩니다.`)}</p>
        </div>
      </div>

      {cancelled && <div className="sf-notice sf-notice-warn mb-6" role="status"><AlertTriangle aria-hidden />{t("Payment was not completed. You can try again or choose another method.", "결제가 완료되지 않았습니다. 다시 시도하거나 다른 결제 수단을 선택하세요.")}</div>}
      {declined && <div className="sf-notice sf-notice-bad mb-6" role="alert"><AlertTriangle aria-hidden />{t("Your last payment attempt was declined or cancelled. No money was taken.", "직전 결제 시도가 거절되었거나 취소되었습니다. 결제된 금액은 없습니다.")}</div>}

      <div className="sf-checkout">
        <div className="grid gap-5">
          <section className="sf-card sf-card-pad">
            <div className="flex items-center gap-4">
              <img src={mediaUrl(product.coverKey)} alt="" className="sf-thumb sf-thumb-lg" />
              <div className="min-w-0 flex-1">
                <Link href={`/p/${product.slug}`} className="block text-[17px] font-semibold text-[#20211f] hover:underline">{pick(lang, product.titleEn, product.titleKo)}</Link>
                <p className="!mt-1 text-sm text-[#6b7065]">{t(`Ordered ${formatDate(order.createdAt, lang, true)}`, `${formatDate(order.createdAt, lang, true)} 주문`)}</p>
              </div>
              <strong className="text-[17px]">{money(order.totalCents)}</strong>
            </div>
          </section>
          <RedirectForm action={resumePayment} className="grid gap-5">
            <input type="hidden" name="orderId" value={order.id} />
            <section className="sf-card sf-card-pad grid gap-4">
              <PaymentMethods options={options} t={t} step={1} />
              <BusyButton className="sf-btn sf-btn-primary sf-btn-lg sf-btn-block" busyLabel={t("Processing…", "처리 중…")}><Lock size={17} aria-hidden />{t(`Pay ${money(order.totalCents)}`, `${money(order.totalCents)} 결제하기`)}</BusyButton>
            </section>
          </RedirectForm>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#6b7065]">
            <span>{t("Changed your mind?", "구매를 원하지 않으시나요?")}</span>
            <ActionButton action={cancelOrder.bind(null, order.id)} confirm={t("Cancel this order?", "이 주문을 취소할까요?")} className="sf-btn sf-btn-danger sf-btn-sm">{t("Cancel order", "주문 취소")}</ActionButton>
          </div>
        </div>
        <aside className="sf-summary sf-card sf-card-pad" aria-labelledby="summary-title">
          <h2 id="summary-title" className="sf-h2 !mb-3">{t("Order summary", "결제 금액")}</h2>
          <div className="sf-line"><span>{t("Subtotal", "상품 금액")}</span><span>{money(order.subtotalCents)}</span></div>
          <div className="sf-line"><span>{t("Coupon discount", "쿠폰 할인")}{order.couponCode ? ` (${order.couponCode})` : ""}</span><span>{order.discountCents ? `−${money(order.discountCents)}` : money(0)}</span></div>
          <div className="sf-line sf-line-total"><span>{t("Total", "총 결제 금액")}</span><span>{money(order.totalCents)}</span></div>
        </aside>
      </div>
    </main>
  );
}
