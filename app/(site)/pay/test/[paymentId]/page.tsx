import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { FlaskConical } from "lucide-react";
import * as s from "@/db/schema";
import { requireViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { testProvider } from "@/lib/server/payments/test-provider";
import { isUuid } from "@/lib/server/storefront";
import { formatMoney } from "@/lib/i18n";
import { ActionButton } from "@/components/common/action-form";
import { approveTestPayment, declineTestPayment } from "./actions";

export const metadata: Metadata = { title: "Test payment", robots: { index: false } };

/** Sandbox "payment page" for the built-in test provider. Never moves money. */
export default async function TestPaymentPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const viewer = await requireViewer(`/pay/test/${paymentId}`);
  if (!isUuid(paymentId) || !testProvider.isAvailable()) notFound();
  const db = await getDb();
  const { t, lang } = await getT();
  const [row] = await db.select({ payment: s.payments, order: s.orders }).from(s.payments).innerJoin(s.orders, eq(s.orders.id, s.payments.orderId)).where(eq(s.payments.id, paymentId));
  if (!row || row.order.buyerId !== viewer.user.id || row.payment.provider !== testProvider.id) notFound();
  const { payment, order } = row;
  if (payment.status === "succeeded") redirect(`/account/orders/${order.id}?paid=1`);
  if (payment.status !== "pending" || order.status !== "pending_payment") redirect(order.status === "pending_payment" ? `/checkout/${order.id}` : `/account/orders/${order.id}`);

  return (
    <main className="shell sf-page flex justify-center">
      <div className="w-full max-w-[480px]">
        <div className="sf-notice sf-notice-test mb-5" role="note">
          <FlaskConical aria-hidden />
          <div><strong>{t("Test payment — no money is charged.", "테스트 결제 — 실제 금액이 청구되지 않습니다.")}</strong> {t("This sandbox simulates a payment provider so the order flow can be tested.", "주문 흐름을 확인하기 위해 결제사를 흉내 내는 샌드박스 화면입니다.")}</div>
        </div>
        <section className="sf-card sf-card-pad" aria-labelledby="pay-title">
          <p className="sf-kicker">{t("Ringo payment sandbox", "링고 결제 샌드박스")}</p>
          <h1 id="pay-title" className="sf-h1">{formatMoney(payment.amountCents, payment.currency, lang)}</h1>
          <dl className="sf-dl !mt-5">
            <dt>{t("Order", "주문번호")}</dt><dd>{order.orderNo}</dd>
            <dt>{t("Product", "상품")}</dt><dd>{order.productTitle}</dd>
            <dt>{t("Buyer", "구매자")}</dt><dd>{order.buyerEmail}</dd>
            <dt>{t("Reference", "결제 참조")}</dt><dd className="font-mono text-[13px]">{payment.providerRef ?? payment.id}</dd>
          </dl>
          <div className="mt-6 grid gap-2.5">
            <ActionButton action={approveTestPayment.bind(null, payment.id)} className="sf-btn sf-btn-primary sf-btn-lg sf-btn-block">{t("Approve test payment", "테스트 결제 승인")}</ActionButton>
            <ActionButton action={declineTestPayment.bind(null, payment.id)} className="sf-btn sf-btn-outline sf-btn-lg sf-btn-block">{t("Decline", "결제 거절")}</ActionButton>
          </div>
        </section>
      </div>
    </main>
  );
}
