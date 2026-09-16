"use server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import { requireViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { ActionError, run, type ActionResult } from "@/lib/server/action";
import { getT } from "@/lib/server/i18n-server";
import { CommerceError, cancelPendingOrder, createOrder, startPayment } from "@/lib/server/commerce";
import { readAttribution } from "@/lib/server/links";
import { appOrigin, rateLimit } from "@/lib/server/request";

const placeInput = z.object({
  productId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  coupon: z.string().trim().max(40).optional().transform((v) => v || null),
  brief: z.string().max(4000).optional().transform((v) => v?.trim() || null),
  provider: z.string().max(40).optional().transform((v) => v || null),
  terms: z.string().optional(),
});

/** Create the order (prices come from the DB), then hand off to the payment provider. */
export async function placeOrder(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer("/account");
    const { t } = await getT();
    const input = placeInput.parse(Object.fromEntries(fd));
    if (input.terms !== "on") throw new ActionError(t("Please agree to the terms to continue.", "약관에 동의해야 결제를 진행할 수 있습니다."));
    if (!rateLimit(`checkout:${viewer.user.id}`, 20, 10 * 60000)) throw new ActionError("too_many_attempts");
    const db = await getDb();
    const attr = await readAttribution();
    const attribution = attr.productId === input.productId ? { linkId: attr.linkId, source: attr.source, medium: attr.medium, campaign: attr.campaign } : undefined;
    const order = await createOrder(db, viewer, { productId: input.productId, couponCode: input.coupon, brief: input.brief, idempotencyKey: input.idempotencyKey, attribution });
    if (order.status === "paid") return { ok: true, redirect: `/account/orders/${order.id}?paid=1` };
    if (order.status !== "pending_payment") throw new CommerceError("order_not_payable");
    if (!input.provider) throw new ActionError(t("Choose a payment method.", "결제 수단을 선택하세요."));
    const url = await startPayment(db, viewer, order.id, input.provider, await appOrigin());
    return { ok: true, redirect: url };
  });
}

/** Retry payment for an existing pending order. */
export async function resumePayment(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer("/account/orders");
    const { t } = await getT();
    const input = z.object({ orderId: z.string().uuid(), provider: z.string().max(40).optional() }).parse(Object.fromEntries(fd));
    if (!input.provider) throw new ActionError(t("Choose a payment method.", "결제 수단을 선택하세요."));
    if (!rateLimit(`checkout:${viewer.user.id}`, 20, 10 * 60000)) throw new ActionError("too_many_attempts");
    const db = await getDb();
    const [order] = await db.select({ id: s.orders.id }).from(s.orders).where(and(eq(s.orders.id, input.orderId), eq(s.orders.buyerId, viewer.user.id)));
    if (!order) throw new CommerceError("not_found");
    const url = await startPayment(db, viewer, order.id, input.provider, await appOrigin());
    return { ok: true, redirect: url };
  });
}

export async function cancelOrder(orderId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer("/account/orders");
    if (!z.string().uuid().safeParse(orderId).success) throw new CommerceError("not_found");
    const db = await getDb();
    const [order] = await db.select({ id: s.orders.id }).from(s.orders).where(and(eq(s.orders.id, orderId), eq(s.orders.buyerId, viewer.user.id)));
    if (!order) throw new CommerceError("not_found");
    await cancelPendingOrder(db, viewer, orderId);
    const { t } = await getT();
    return { ok: true, message: t("Order cancelled.", "주문을 취소했습니다."), redirect: `/account/orders/${orderId}` };
  });
}
