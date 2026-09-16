"use server";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { run, type ActionResult } from "@/lib/server/action";
import { getT } from "@/lib/server/i18n-server";
import { CommerceError, confirmPayment, failPayment } from "@/lib/server/commerce";
import { testProvider } from "@/lib/server/payments/test-provider";
import { isUuid } from "@/lib/server/storefront";

/** Loads a pending sandbox payment that belongs to the signed-in buyer. */
async function ownTestPayment(paymentId: string) {
  const viewer = await requireViewer("/account/orders");
  if (!isUuid(paymentId) || !testProvider.isAvailable()) throw new CommerceError("not_found");
  const db = await getDb();
  const [row] = await db.select({ payment: s.payments, order: s.orders }).from(s.payments).innerJoin(s.orders, eq(s.orders.id, s.payments.orderId)).where(eq(s.payments.id, paymentId));
  if (!row || row.order.buyerId !== viewer.user.id || row.payment.provider !== testProvider.id) throw new CommerceError("not_found");
  return { db, ...row };
}

export async function approveTestPayment(paymentId: string): Promise<ActionResult> {
  return run(async () => {
    const { db, payment, order } = await ownTestPayment(paymentId);
    if (payment.status === "succeeded") return { ok: true, redirect: `/account/orders/${order.id}?paid=1` };
    if (payment.status !== "pending" || order.status !== "pending_payment") throw new CommerceError("order_not_payable");
    const paid = await confirmPayment(db, payment.id, { providerRef: payment.providerRef ?? `test_${payment.id.slice(0, 8)}`, method: "test" });
    const { t } = await getT();
    return { ok: true, message: t("Test payment approved.", "테스트 결제가 승인되었습니다."), redirect: `/account/orders/${paid.id}?paid=1` };
  });
}

export async function declineTestPayment(paymentId: string): Promise<ActionResult> {
  return run(async () => {
    const { db, payment, order } = await ownTestPayment(paymentId);
    if (payment.status !== "pending") throw new CommerceError("invalid_state");
    await failPayment(db, payment.id, "Declined in test sandbox");
    return { ok: true, redirect: `/checkout/${order.id}` };
  });
}
