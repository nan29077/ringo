"use server";
import { revalidatePath } from "next/cache";
import { zonedStamp } from "@/lib/time";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { recipientLang } from "@/lib/server/mail";
import { notify } from "@/lib/server/notify";
import { appOrigin } from "@/lib/server/request";
import { formatMoney } from "@/lib/i18n";
import { CommerceError, addOrderEvent, cancelPendingOrder, deliverOrder, getOrderForActor, markInProgress, refundOrder, rejectRefund } from "@/lib/server/commerce";

const uuid = z.string().uuid();
const field = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function adminCancelOrder(orderId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const id = uuid.parse(orderId);
    await cancelPendingOrder(db, viewer, id);
    await audit(db, viewer, "order.cancel", "order", id);
    return { ok: true, message: t("Order cancelled.", "주문을 취소했습니다.") };
  }, "ko");
}

export async function adminStartProduction(orderId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const id = uuid.parse(orderId);
    await markInProgress(db, viewer, id);
    await audit(db, viewer, "order.in_progress", "order", id, { onBehalfOfSeller: true });
    revalidatePath("/admin", "layout");
    return { ok: true, message: t("Marked as in production.", "제작 중으로 변경했습니다.") };
  }, "ko");
}

export async function adminDeliverOrder(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const id = uuid.parse(field(fd, "orderId"));
    const note = z.string().max(4000).parse(field(fd, "note"));
    const before = await getOrderForActor(db, viewer, id);
    await deliverOrder(db, viewer, id, note);
    await audit(db, viewer, before.fulfillmentStatus === "delivered" ? "order.redeliver" : "order.deliver", "order", id, { onBehalfOfSeller: true });
    revalidatePath("/admin", "layout");
    return { ok: true, message: t("Delivered. The buyer was notified by email.", "납품 처리했습니다. 구매자에게 이메일로 알렸습니다.") };
  }, "ko");
}

export async function adminApproveRefund(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const id = uuid.parse(field(fd, "orderId"));
    const note = z.string().trim().max(500).parse(field(fd, "note"));
    const order = await getOrderForActor(db, viewer, id);
    if (order.refundStatus !== "requested") throw new CommerceError("invalid_state");
    const reason = note || `Admin approved buyer request: ${order.refundReason ?? ""}`.slice(0, 500);
    await refundOrder(db, viewer, id, reason);
    await audit(db, viewer, "order.refund", "order", id, { reason, kind: "approve_request" });
    revalidatePath("/admin", "layout");
    return { ok: true, message: t("Refund completed.", "환불을 완료했습니다.") };
  }, "ko");
}

export async function adminRejectRefund(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const id = uuid.parse(field(fd, "orderId"));
    const reason = z.string().max(2000).parse(field(fd, "reason"));
    await rejectRefund(db, viewer, id, reason);
    await audit(db, viewer, "order.refund_reject", "order", id, { reason });
    revalidatePath("/admin", "layout");
    return { ok: true, message: t("Refund request rejected. The buyer was notified.", "환불 요청을 거절하고 구매자에게 알렸습니다.") };
  }, "ko");
}

/** Admin-initiated full refund (no buyer request needed). `mode=manual` records a refund already made in the PG console. */
export async function adminForceRefund(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const input = z
      .object({ orderId: uuid, reason: z.string().trim().min(1).max(500), mode: z.enum(["provider", "manual"]), ack: z.string().optional() })
      .parse(Object.fromEntries(fd));
    if (input.mode === "manual" && input.ack !== "on") {
      return { ok: false, error: t("Confirm that the refund was already completed in the payment provider console.", "PG 관리자 화면에서 환불을 먼저 완료했는지 확인란에 체크하세요.") };
    }
    await refundOrder(db, viewer, input.orderId, input.reason, { manual: input.mode === "manual" });
    await audit(db, viewer, input.mode === "manual" ? "order.refund_manual" : "order.refund_force", "order", input.orderId, { reason: input.reason });
    revalidatePath("/admin", "layout");
    return { ok: true, message: input.mode === "manual" ? t("Manual refund recorded.", "수동 환불을 기록했습니다.") : t("Refund completed.", "환불을 완료했습니다.") };
  }, "ko");
}

export async function adminResendReceipt(orderId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const id = uuid.parse(orderId);
    const [o] = await db.select().from(s.orders).where(eq(s.orders.id, id));
    if (!o) throw new CommerceError("not_found");
    if (o.status !== "paid" && o.status !== "refunded") throw new CommerceError("invalid_state");
    const origin = await appOrigin();
    await notify(db, o.buyerEmail, "order_receipt", await recipientLang(db, { userId: o.buyerId }), {
      name: o.buyerName,
      orderNo: o.orderNo,
      product: o.productTitle,
      subtotal: formatMoney(o.subtotalCents, o.currency),
      discount: o.discountCents ? formatMoney(o.discountCents, o.currency) : null,
      coupon: o.couponCode,
      total: formatMoney(o.totalCents, o.currency),
      paidAt: zonedStamp(o.paidAt) || "-",
      refunded: o.refundedCents ? formatMoney(o.refundedCents, o.currency) : null,
      refundedAt: zonedStamp(o.refundedAt) || null,
      orderUrl: `${origin}/account/orders/${o.id}`,
    });
    await addOrderEvent(db, o.id, "receipt_resent", `Receipt re-sent to ${o.buyerEmail}`, viewer);
    await audit(db, viewer, "order.receipt_resend", "order", o.id, { to: o.buyerEmail });
    return { ok: true, message: t(`Receipt sent to ${o.buyerEmail}.`, `${o.buyerEmail}로 영수증을 다시 보냈습니다.`) };
  }, "ko");
}

export async function adminSaveOrderMemo(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const input = z.object({ orderId: uuid, memo: z.string().max(4000) }).parse(Object.fromEntries(fd));
    const res = await db.update(s.orders).set({ adminMemo: input.memo.trim() || null, updatedAt: new Date() }).where(eq(s.orders.id, input.orderId)).returning({ id: s.orders.id });
    if (!res.length) throw new CommerceError("not_found");
    await audit(db, viewer, "order.memo", "order", input.orderId, { length: input.memo.trim().length });
    return { ok: true, message: t("Memo saved.", "메모를 저장했습니다.") };
  }, "ko");
}
