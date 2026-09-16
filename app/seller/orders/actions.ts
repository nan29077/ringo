"use server";
import { z } from "zod";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { CommerceError, deliverOrder, getOrderForActor, markInProgress, refundOrder, rejectRefund } from "@/lib/server/commerce";

const id = z.string().uuid();

export async function sellerStartProduction(orderId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireSeller();
    const db = await getDb();
    const { t } = await getT("ko");
    await markInProgress(db, viewer, id.parse(orderId));
    await audit(db, viewer, "order.in_progress", "order", orderId);
    return { ok: true, message: t("Marked as in production.", "제작 중으로 변경했습니다.") };
  }, "ko");
}

export async function sellerDeliverOrder(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireSeller();
    const db = await getDb();
    const { t } = await getT("ko");
    const orderId = id.parse(String(fd.get("orderId")));
    const note = z.string().max(4000).parse(String(fd.get("note") ?? ""));
    const before = await getOrderForActor(db, viewer, orderId);
    await deliverOrder(db, viewer, orderId, note);
    await audit(db, viewer, before.fulfillmentStatus === "delivered" ? "order.redeliver" : "order.deliver", "order", orderId);
    return { ok: true, message: t("Delivered. The buyer was notified by email.", "납품했습니다. 구매자에게 이메일로 알렸습니다.") };
  }, "ko");
}

export async function sellerApproveRefund(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireSeller();
    const db = await getDb();
    const { t } = await getT("ko");
    const orderId = id.parse(String(fd.get("orderId")));
    const order = await getOrderForActor(db, viewer, orderId);
    if (order.refundStatus !== "requested") throw new CommerceError("refund_needs_request");
    const note = z.string().trim().max(500).parse(String(fd.get("note") ?? ""));
    const reason = note || `Seller approved buyer request: ${order.refundReason ?? ""}`.slice(0, 500);
    await refundOrder(db, viewer, orderId, reason);
    await audit(db, viewer, "order.refund", "order", orderId, { reason });
    return { ok: true, message: t("Refund completed.", "환불을 완료했습니다.") };
  }, "ko");
}

export async function sellerRejectRefund(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireSeller();
    const db = await getDb();
    const { t } = await getT("ko");
    const orderId = id.parse(String(fd.get("orderId")));
    const reason = z.string().max(2000).parse(String(fd.get("reason") ?? ""));
    await rejectRefund(db, viewer, orderId, reason);
    await audit(db, viewer, "order.refund_reject", "order", orderId, { reason });
    return { ok: true, message: t("Refund request rejected. The buyer was notified.", "환불 요청을 거절하고 구매자에게 알렸습니다.") };
  }, "ko");
}
