import "server-only";
import { and, eq, inArray, isNull, lt, lte, ne, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import type { DB, Tx } from "./db";
import type { Viewer } from "./auth";
import { getSettings } from "./settings";
import { newOrderNo } from "./ids";
import { getProvider } from "./payments";
import { sendMail } from "./mail";
import { logError } from "./audit";
import { formatMoney } from "../i18n";

export class CommerceError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

type Order = typeof s.orders.$inferSelect;
type Product = typeof s.products.$inferSelect;
type Coupon = typeof s.coupons.$inferSelect;

export async function addOrderEvent(db: DB, orderId: string, type: string, message: string, actor?: Viewer | null) {
  await db.insert(s.orderEvents).values({ orderId, type, message, actorId: actor?.user.id, actorRole: actor?.user.role });
}

/* ------------------------------------------------------------------ coupons */

export function couponDiscount(coupon: Coupon, subtotalCents: number) {
  let discount = coupon.kind === "percent" ? Math.floor((subtotalCents * coupon.value) / 100) : coupon.value;
  if (coupon.maxDiscountCents != null) discount = Math.min(discount, coupon.maxDiscountCents);
  return Math.max(0, Math.min(discount, subtotalCents));
}

export async function validateCoupon(db: DB, code: string, product: Product, buyerId: string) {
  const [coupon] = await db.select().from(s.coupons).where(eq(s.coupons.code, code.trim().toUpperCase()));
  const now = Date.now();
  if (!coupon || !coupon.active) throw new CommerceError("coupon_invalid");
  if (coupon.startsAt && coupon.startsAt.getTime() > now) throw new CommerceError("coupon_not_started");
  if (coupon.endsAt && coupon.endsAt.getTime() < now) throw new CommerceError("coupon_expired");
  if (coupon.sellerId && coupon.sellerId !== product.sellerId) throw new CommerceError("coupon_not_applicable");
  if (coupon.productId && coupon.productId !== product.id) throw new CommerceError("coupon_not_applicable");
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) throw new CommerceError("coupon_exhausted");
  if (product.priceCents < coupon.minOrderCents) throw new CommerceError("coupon_min_order");
  const [{ used }] = await db
    .select({ used: sql<number>`count(*)::int` })
    .from(s.orders)
    .where(and(eq(s.orders.couponId, coupon.id), eq(s.orders.buyerId, buyerId), eq(s.orders.status, "paid")));
  if (used >= coupon.perUserLimit) throw new CommerceError("coupon_used");
  return { coupon, discountCents: couponDiscount(coupon, product.priceCents) };
}

/* ------------------------------------------------------------------ orders */

export type Attribution = { linkId?: string | null; source?: string | null; medium?: string | null; campaign?: string | null };

export async function createOrder(
  db: DB,
  viewer: Viewer,
  input: { productId: string; couponCode?: string | null; brief?: string | null; idempotencyKey: string; attribution?: Attribution },
) {
  const existing = await db
    .select()
    .from(s.orders)
    .where(and(eq(s.orders.buyerId, viewer.user.id), eq(s.orders.idempotencyKey, input.idempotencyKey)));
  if (existing[0]) return existing[0];

  const [row] = await db
    .select({ product: s.products, seller: s.sellers })
    .from(s.products)
    .innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId))
    .where(eq(s.products.id, input.productId));
  if (!row || row.product.status !== "published" || !row.product.visible) throw new CommerceError("product_unavailable");
  if (row.seller.status !== "active") throw new CommerceError("product_unavailable");
  if (row.seller.userId === viewer.user.id) throw new CommerceError("own_product");
  const { product, seller } = row;

  // Never take money for a product that cannot deliver anything (e.g. its last file was removed).
  if (product.deliveryType === "download" || product.deliveryType === "collection") {
    const [{ files }] = await db.select({ files: sql<number>`count(*)::int` }).from(s.productAssets).where(eq(s.productAssets.productId, product.id));
    if (!files) throw new CommerceError("product_unavailable");
  }
  if (product.deliveryType !== "service") {
    const owned = await db
      .select({ id: s.entitlements.id })
      .from(s.entitlements)
      .where(and(eq(s.entitlements.userId, viewer.user.id), eq(s.entitlements.productId, product.id), eq(s.entitlements.status, "active")));
    if (owned.length) throw new CommerceError("already_owned");
  } else if (!input.brief?.trim()) {
    throw new CommerceError("brief_required");
  }

  const settings = await getSettings(db);
  let couponId: string | null = null;
  let couponCode: string | null = null;
  let discountCents = 0;
  if (input.couponCode?.trim()) {
    const v = await validateCoupon(db, input.couponCode, product, viewer.user.id);
    couponId = v.coupon.id;
    couponCode = v.coupon.code;
    discountCents = v.discountCents;
  }
  const totalCents = product.priceCents - discountCents;
  const commissionBps = seller.commissionBps ?? settings.commerce.defaultCommissionBps;
  // Commission is charged on what the buyer actually paid. Platform coupons reduce the platform's share first.
  const commissionCents = Math.round((totalCents * commissionBps) / 10000);
  const sellerNetCents = totalCents - commissionCents;

  let link: typeof s.deepLinks.$inferSelect | undefined;
  if (input.attribution?.linkId) {
    [link] = await db.select().from(s.deepLinks).where(eq(s.deepLinks.id, input.attribution.linkId));
    if (link && link.productId !== product.id) link = undefined; // attribution only counts for the linked product
  }

  const [order] = await db
    .insert(s.orders)
    .values({
      orderNo: newOrderNo(),
      buyerId: viewer.user.id,
      productId: product.id,
      sellerId: seller.id,
      productTitle: product.titleEn,
      status: "pending_payment",
      currency: product.currency,
      subtotalCents: product.priceCents,
      discountCents,
      totalCents,
      commissionBps,
      commissionCents,
      sellerNetCents,
      couponId,
      couponCode,
      linkId: link?.id ?? null,
      source: link?.source ?? input.attribution?.source?.slice(0, 80) ?? "storefront",
      medium: link?.medium ?? input.attribution?.medium?.slice(0, 80) ?? null,
      campaign: link?.campaign ?? input.attribution?.campaign?.slice(0, 80) ?? null,
      buyerEmail: viewer.user.email,
      buyerName: viewer.user.name,
      brief: product.deliveryType === "service" ? input.brief!.trim().slice(0, 4000) : null,
      idempotencyKey: input.idempotencyKey,
    })
    .onConflictDoNothing()
    .returning();
  if (!order) {
    const [again] = await db.select().from(s.orders).where(and(eq(s.orders.buyerId, viewer.user.id), eq(s.orders.idempotencyKey, input.idempotencyKey)));
    return again;
  }
  await addOrderEvent(db, order.id, "created", `Order created · ${formatMoney(totalCents, order.currency)}`, viewer);
  if (totalCents === 0) {
    const [payment] = await db.insert(s.payments).values({ orderId: order.id, provider: "free", status: "pending", amountCents: 0, currency: order.currency }).returning();
    return confirmPayment(db, payment.id, { providerRef: "free" });
  }
  return order;
}

export async function startPayment(db: DB, viewer: Viewer, orderId: string, providerId: string, origin: string) {
  const [order] = await db.select().from(s.orders).where(eq(s.orders.id, orderId));
  if (!order || order.buyerId !== viewer.user.id) throw new CommerceError("not_found");
  if (order.status !== "pending_payment") throw new CommerceError("order_not_payable");
  const settings = await getSettings(db);
  // The payment window is enforced here too, not only by the scheduled cleanup.
  if (order.createdAt.getTime() + settings.commerce.pendingPaymentMinutes * 60000 <= Date.now()) {
    await db.update(s.orders).set({ status: "expired", updatedAt: new Date() }).where(and(eq(s.orders.id, order.id), eq(s.orders.status, "pending_payment")));
    await db.update(s.payments).set({ status: "cancelled", failureReason: "expired", updatedAt: new Date() }).where(and(eq(s.payments.orderId, order.id), eq(s.payments.status, "pending")));
    await addOrderEvent(db, order.id, "expired", "Payment window elapsed", viewer);
    throw new CommerceError("order_expired");
  }
  const provider = getProvider(providerId);
  if (!provider || !provider.isAvailable() || !settings.payments.enabledProviders.includes(provider.id)) throw new CommerceError("provider_unavailable");
  const [payment] = await db
    .insert(s.payments)
    .values({ orderId: order.id, provider: provider.id, status: "pending", amountCents: order.totalCents, currency: order.currency })
    .returning();
  try {
    const res = await provider.createCheckout({
      paymentId: payment.id,
      orderId: order.id,
      orderNo: order.orderNo,
      amountCents: order.totalCents,
      currency: order.currency,
      description: order.productTitle,
      buyer: { email: order.buyerEmail, name: order.buyerName },
      returnUrl: `${origin}/account/orders/${order.id}?paid=1`,
      cancelUrl: `${origin}/checkout/${order.id}?cancelled=1`,
      webhookUrl: `${origin}/api/payments/webhook/${provider.id}`,
    });
    await db.update(s.payments).set({ providerRef: res.providerRef, checkoutUrl: res.checkoutUrl, updatedAt: new Date() }).where(eq(s.payments.id, payment.id));
    await addOrderEvent(db, order.id, "payment_started", `Payment started via ${provider.label}`, viewer);
    return res.checkoutUrl;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(s.payments).set({ status: "failed", failureReason: message, updatedAt: new Date() }).where(eq(s.payments.id, payment.id));
    await logError(db, `payment:${provider.id}`, message, { orderId: order.id, paymentId: payment.id });
    throw new CommerceError("provider_error", message);
  }
}

/** Idempotent: marks payment + order paid, grants entitlement, sends notifications. */
export async function confirmPayment(db: DB, paymentId: string, info: { providerRef?: string; raw?: unknown; method?: string }) {
  const result = await db.transaction(async (tx) => {
    const [payment] = await tx.select().from(s.payments).where(eq(s.payments.id, paymentId)).for("update");
    if (!payment) throw new CommerceError("not_found");
    const [order] = await tx.select().from(s.orders).where(eq(s.orders.id, payment.orderId)).for("update");
    if (payment.status === "succeeded") return { order, changed: false };
    if (payment.amountCents !== order.totalCents) throw new CommerceError("amount_mismatch");
    await tx.update(s.payments).set({ status: "succeeded", providerRef: info.providerRef ?? payment.providerRef, method: info.method ?? payment.method, raw: (info.raw as object) ?? null, updatedAt: new Date() }).where(eq(s.payments.id, payment.id));
    if (order.status !== "pending_payment") {
      // Paid after cancel/expiry: keep money traceable for manual refund.
      await tx.insert(s.orderEvents).values({ orderId: order.id, type: "late_payment", message: `Payment received while order was ${order.status}. Refund manually.` });
      return { order, changed: false };
    }
    const [product] = await tx.select().from(s.products).where(eq(s.products.id, order.productId));
    const now = new Date();
    const service = product.deliveryType === "service";
    const [paid] = await tx
      .update(s.orders)
      .set({
        status: "paid",
        paidAt: now,
        updatedAt: now,
        fulfillmentStatus: service ? "pending" : "not_required",
        dueAt: service ? new Date(now.getTime() + (product.deliveryDays ?? 7) * 86400000) : null,
      })
      .where(eq(s.orders.id, order.id))
      .returning();
    await tx.insert(s.entitlements).values({ userId: order.buyerId, productId: order.productId, orderId: order.id }).onConflictDoNothing();
    await tx.update(s.products).set({ salesCount: sql`${s.products.salesCount} + 1` }).where(eq(s.products.id, order.productId));
    if (order.couponId) await tx.update(s.coupons).set({ usedCount: sql`${s.coupons.usedCount} + 1` }).where(eq(s.coupons.id, order.couponId));
    await tx.insert(s.orderEvents).values({ orderId: order.id, type: "paid", message: `Payment succeeded (${payment.provider})` });
    // Cancel the buyer's other pending orders for the same product.
    await tx.update(s.orders).set({ status: "cancelled", cancelledAt: now, updatedAt: now }).where(and(eq(s.orders.buyerId, order.buyerId), eq(s.orders.productId, order.productId), eq(s.orders.status, "pending_payment"), ne(s.orders.id, order.id)));
    return { order: paid, changed: true };
  });
  if (result.changed) await notifyPaid(db, result.order);
  return result.order;
}

export async function failPayment(db: DB, paymentId: string, reason: string, status: "failed" | "cancelled" = "failed") {
  const [payment] = await db.select().from(s.payments).where(eq(s.payments.id, paymentId));
  if (!payment || payment.status !== "pending") return;
  await db.update(s.payments).set({ status, failureReason: reason.slice(0, 500), updatedAt: new Date() }).where(eq(s.payments.id, paymentId));
  await addOrderEvent(db, payment.orderId, "payment_failed", `Payment ${status}: ${reason}`);
}

async function notifyPaid(db: DB, order: Order) {
  const [seller] = await db.select({ email: s.users.email, name: s.sellers.displayName }).from(s.sellers).innerJoin(s.users, eq(s.users.id, s.sellers.userId)).where(eq(s.sellers.id, order.sellerId));
  const origin = process.env.APP_URL || "";
  await sendMail(db, order.buyerEmail, `Your Ringo order ${order.orderNo}`, `Hi ${order.buyerName},\n\nThank you for your purchase of "${order.productTitle}" (${formatMoney(order.totalCents, order.currency)}).\nOpen your library: ${origin}/account/library\n\nOrder: ${order.orderNo}`, "order_paid_buyer");
  if (seller) await sendMail(db, seller.email, `New order ${order.orderNo}`, `${seller.name}, you have a new order for "${order.productTitle}".\nNet: ${formatMoney(order.sellerNetCents, order.currency)}\n${origin}/seller/orders/${order.id}`, "order_paid_seller");
}

export async function cancelPendingOrder(db: DB, viewer: Viewer, orderId: string) {
  const [order] = await db.select().from(s.orders).where(eq(s.orders.id, orderId));
  if (!order) throw new CommerceError("not_found");
  if (viewer.user.role !== "admin" && order.buyerId !== viewer.user.id) throw new CommerceError("forbidden");
  if (order.status !== "pending_payment") throw new CommerceError("order_not_cancellable");
  await db.update(s.orders).set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() }).where(eq(s.orders.id, orderId));
  await db.update(s.payments).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(s.payments.orderId, orderId), eq(s.payments.status, "pending")));
  await addOrderEvent(db, orderId, "cancelled", "Order cancelled before payment", viewer);
}

export async function expireStaleOrders(db: DB) {
  const settings = await getSettings(db);
  const cutoff = new Date(Date.now() - settings.commerce.pendingPaymentMinutes * 60000);
  const stale = await db.select({ id: s.orders.id }).from(s.orders).where(and(eq(s.orders.status, "pending_payment"), lte(s.orders.createdAt, cutoff)));
  if (!stale.length) return 0;
  const ids = stale.map((o) => o.id);
  await db.update(s.orders).set({ status: "expired", updatedAt: new Date() }).where(inArray(s.orders.id, ids));
  await db.update(s.payments).set({ status: "cancelled", failureReason: "expired", updatedAt: new Date() }).where(and(inArray(s.payments.orderId, ids), eq(s.payments.status, "pending")));
  return ids.length;
}

/* ------------------------------------------------------------------ fulfillment & refunds */

function canManageOrder(viewer: Viewer, order: Order) {
  return viewer.user.role === "admin" || (viewer.seller?.status === "active" && viewer.seller.id === order.sellerId);
}

export async function getOrderForActor(db: DB, viewer: Viewer, orderId: string) {
  const [order] = await db.select().from(s.orders).where(eq(s.orders.id, orderId));
  if (!order || !canManageOrder(viewer, order)) throw new CommerceError("not_found");
  return order;
}

export async function markInProgress(db: DB, viewer: Viewer, orderId: string) {
  const order = await getOrderForActor(db, viewer, orderId);
  if (order.status !== "paid" || order.fulfillmentStatus !== "pending") throw new CommerceError("invalid_state");
  await db.update(s.orders).set({ fulfillmentStatus: "in_progress", updatedAt: new Date() }).where(eq(s.orders.id, orderId));
  await addOrderEvent(db, orderId, "in_progress", "Production started", viewer);
}

export async function deliverOrder(db: DB, viewer: Viewer, orderId: string, note: string) {
  const order = await getOrderForActor(db, viewer, orderId);
  if (order.status !== "paid" || !["pending", "in_progress", "delivered"].includes(order.fulfillmentStatus)) throw new CommerceError("invalid_state");
  if (!note.trim()) throw new CommerceError("note_required");
  await db.update(s.orders).set({ fulfillmentStatus: "delivered", deliveryNote: note.trim().slice(0, 4000), deliveredAt: new Date(), updatedAt: new Date() }).where(eq(s.orders.id, orderId));
  await addOrderEvent(db, orderId, "delivered", "Delivery sent to buyer", viewer);
  await sendMail(db, order.buyerEmail, `Your order ${order.orderNo} has been delivered`, `"${order.productTitle}" is ready.\n\n${note.trim()}\n\n${process.env.APP_URL || ""}/account/orders/${order.id}`, "order_delivered");
}

export async function requestRefund(db: DB, viewer: Viewer, orderId: string, reason: string) {
  const [order] = await db.select().from(s.orders).where(eq(s.orders.id, orderId));
  if (!order || order.buyerId !== viewer.user.id) throw new CommerceError("not_found");
  if (order.status !== "paid" || !["none", "rejected"].includes(order.refundStatus)) throw new CommerceError("refund_not_allowed");
  const settings = await getSettings(db);
  if (order.paidAt && Date.now() - order.paidAt.getTime() > settings.commerce.refundWindowDays * 86400000) throw new CommerceError("refund_window_passed");
  if (!reason.trim()) throw new CommerceError("reason_required");
  await db.update(s.orders).set({ refundStatus: "requested", refundReason: reason.trim().slice(0, 2000), refundRejectReason: null, updatedAt: new Date() }).where(eq(s.orders.id, orderId));
  await addOrderEvent(db, orderId, "refund_requested", `Refund requested: ${reason.trim().slice(0, 200)}`, viewer);
}

export async function rejectRefund(db: DB, viewer: Viewer, orderId: string, reason: string) {
  const order = await getOrderForActor(db, viewer, orderId);
  if (order.refundStatus !== "requested") throw new CommerceError("invalid_state");
  if (!reason.trim()) throw new CommerceError("reason_required");
  await db.update(s.orders).set({ refundStatus: "rejected", refundRejectReason: reason.trim().slice(0, 2000), updatedAt: new Date() }).where(eq(s.orders.id, orderId));
  await addOrderEvent(db, orderId, "refund_rejected", `Refund rejected: ${reason.trim().slice(0, 200)}`, viewer);
  await sendMail(db, order.buyerEmail, `Refund request for ${order.orderNo}`, `Your refund request was not approved.\nReason: ${reason.trim()}`, "refund_rejected");
}

/**
 * Full refund through the original payment provider. When the provider cannot refund automatically,
 * an admin may record a manual refund (already refunded in the PG console) with `manual: true`.
 */
export async function refundOrder(db: DB, viewer: Viewer, orderId: string, reason: string, opts: { manual?: boolean } = {}) {
  const order = await getOrderForActor(db, viewer, orderId);
  if (order.status !== "paid") throw new CommerceError("invalid_state");
  if (viewer.user.role !== "admin" && order.refundStatus !== "requested") throw new CommerceError("refund_needs_request");
  if (opts.manual && viewer.user.role !== "admin") throw new CommerceError("forbidden");
  const [payment] = await db.select().from(s.payments).where(and(eq(s.payments.orderId, orderId), eq(s.payments.status, "succeeded")));
  let providerRef: string | undefined;
  if (payment && payment.provider !== "free" && order.totalCents > 0 && !opts.manual) {
    const provider = getProvider(payment.provider);
    if (!provider) throw new CommerceError("provider_unavailable");
    try {
      providerRef = (await provider.refund({ providerRef: payment.providerRef, amountCents: order.totalCents, currency: order.currency, reason })).providerRef;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logError(db, `refund:${payment.provider}`, message, { orderId });
      await db.insert(s.refunds).values({ orderId, paymentId: payment.id, amountCents: order.totalCents, reason, status: "failed", processedBy: viewer.user.id });
      throw new CommerceError("refund_provider_error", message);
    }
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    // The status is part of the WHERE so a double submit cannot refund, or deduct from the seller, twice.
    const claimed = await tx
      .update(s.orders)
      .set({ status: "refunded", refundStatus: "refunded", refundedCents: order.totalCents, refundedAt: now, updatedAt: now })
      .where(and(eq(s.orders.id, orderId), eq(s.orders.status, "paid")))
      .returning({ id: s.orders.id });
    if (!claimed.length) throw new CommerceError("invalid_state");
    await tx.insert(s.refunds).values({ orderId, paymentId: payment?.id, amountCents: order.totalCents, reason: (opts.manual ? "[manual] " : "") + reason, status: "succeeded", providerRef, processedBy: viewer.user.id });
    if (payment) await tx.update(s.payments).set({ status: "refunded", updatedAt: now }).where(eq(s.payments.id, payment.id));
    await tx.update(s.entitlements).set({ status: "revoked", revokedAt: now }).where(eq(s.entitlements.orderId, orderId));
    await tx.update(s.products).set({ salesCount: sql`greatest(${s.products.salesCount} - 1, 0)` }).where(eq(s.products.id, order.productId));
    await tx.insert(s.orderEvents).values({ orderId, type: "refunded", message: `Refunded ${formatMoney(order.totalCents, order.currency)}${opts.manual ? " (manual)" : ""}: ${reason.slice(0, 200)}`, actorId: viewer.user.id, actorRole: viewer.user.role });
    await adjustSettlementForRefund(tx, order, viewer, now);
  });
  await sendMail(db, order.buyerEmail, `Refund completed for ${order.orderNo}`, `We refunded ${formatMoney(order.totalCents, order.currency)} for "${order.productTitle}". Access to the content has been removed.`, "refund_completed");
}

/**
 * Keeps settlements consistent when an order that was already batched gets refunded.
 * - Batch still pending: the order is pulled out of the batch and the batch totals are recomputed (cancelled when empty).
 * - Batch already paid out: a negative "adjustment" settlement row is recorded and deducted from the seller's next payout.
 */
async function adjustSettlementForRefund(tx: Tx, order: Order, viewer: Viewer, now: Date) {
  if (!order.settlementId) return;
  const [settlement] = await tx.select().from(s.settlements).where(eq(s.settlements.id, order.settlementId)).for("update");
  if (!settlement) return;
  if (settlement.status === "pending") {
    await tx.update(s.orders).set({ settlementId: null }).where(eq(s.orders.id, order.id));
    // Any deduction merged into this batch goes back to the pending pool, so the batch is recomputed from
    // its remaining orders alone and the outstanding refund debt is applied to whichever payout comes next.
    await releaseMergedAdjustments(tx, settlement.id);
    const [agg] = await tx
      .select({
        n: sql<number>`count(*)::int`,
        gross: sql<number>`coalesce(sum(${s.orders.totalCents}),0)::int`,
        commission: sql<number>`coalesce(sum(${s.orders.commissionCents}),0)::int`,
        net: sql<number>`coalesce(sum(${s.orders.sellerNetCents}),0)::int`,
      })
      .from(s.orders)
      .where(eq(s.orders.settlementId, settlement.id));
    const note = `[refund] ${order.orderNo} removed ${now.toISOString().slice(0, 10)}`;
    const memo = [settlement.memo, note].filter(Boolean).join("\n").slice(0, 2000);
    if (agg.n === 0) {
      await tx.update(s.settlements).set({ status: "cancelled", memo }).where(eq(s.settlements.id, settlement.id));
    } else {
      await tx.update(s.settlements).set({ orderCount: agg.n, grossCents: agg.gross, commissionCents: agg.commission, netCents: agg.net, memo }).where(eq(s.settlements.id, settlement.id));
    }
    await tx.insert(s.orderEvents).values({ orderId: order.id, type: "settlement_adjusted", message: `Removed from pending settlement ${settlement.id.slice(0, 8)}`, actorId: viewer.user.id, actorRole: viewer.user.role });
    return;
  }
  if (settlement.status === "paid" && order.sellerNetCents > 0) {
    const [adjustment] = await tx
      .insert(s.settlements)
      .values({
        sellerId: order.sellerId,
        periodStart: now,
        periodEnd: now,
        currency: order.currency,
        orderCount: 0,
        grossCents: -order.totalCents,
        commissionCents: -order.commissionCents,
        netCents: -order.sellerNetCents,
        status: "pending",
        memo: `[adjustment] refund of ${order.orderNo} after payout (${settlement.reference ?? settlement.id.slice(0, 8)})`,
        createdBy: viewer.user.id,
      })
      .returning({ id: s.settlements.id });
    await tx.insert(s.orderEvents).values({ orderId: order.id, type: "settlement_adjusted", message: `Refund after payout: ${formatMoney(order.sellerNetCents, order.currency)} will be deducted from the next payout (adjustment ${adjustment.id.slice(0, 8)})`, actorId: viewer.user.id, actorRole: viewer.user.role });
  }
}

/** Returns deductions consumed by `settlementId` to the pending pool (used when that batch shrinks or is cancelled). */
async function releaseMergedAdjustments(tx: Tx, settlementId: string) {
  await tx
    .update(s.settlements)
    .set({ status: "pending", reference: null, paidAt: null })
    .where(and(eq(s.settlements.status, "paid"), eq(s.settlements.reference, mergedRef(settlementId)), adjustmentSettlementWhere));
}

/* ------------------------------------------------------------------ settlements */

/** Marks a deduction as consumed by a payout batch. Not a transfer reference: `markSettlementPaid` rejects this shape. */
const mergedRef = (settlementId: string) => `merged:${settlementId}`;

/** Negative settlement rows created when an already-paid-out order is refunded; deducted from the next payout. */
export const adjustmentSettlementWhere = and(eq(s.settlements.orderCount, 0), lt(s.settlements.netCents, 0))!;

export function isAdjustmentSettlement(row: { orderCount: number; netCents: number }) {
  return row.orderCount === 0 && row.netCents < 0;
}

/** Pending (not yet deducted) adjustments for a seller. */
export async function pendingAdjustments(db: DB, sellerId: string) {
  return db.select().from(s.settlements).where(and(eq(s.settlements.sellerId, sellerId), eq(s.settlements.status, "pending"), adjustmentSettlementWhere)).orderBy(s.settlements.createdAt);
}

/** Orders eligible for payout: paid, no open/finished refund, past the refund window, delivered if service, not yet settled. */
export async function eligibleSettlementOrders(db: DB, sellerId: string, until: Date) {
  const settings = await getSettings(db);
  const cutoff = new Date(Math.min(until.getTime(), Date.now() - settings.commerce.refundWindowDays * 86400000));
  const rows = await db
    .select()
    .from(s.orders)
    .where(and(eq(s.orders.sellerId, sellerId), eq(s.orders.status, "paid"), isNull(s.orders.settlementId), lte(s.orders.paidAt, cutoff), ne(s.orders.refundStatus, "requested")));
  return rows.filter((o) => o.totalCents > 0 && (o.fulfillmentStatus === "not_required" || o.fulfillmentStatus === "delivered"));
}

export async function createSettlement(db: DB, viewer: Viewer, sellerId: string, until: Date, memo?: string) {
  const [orders, adjustments] = await Promise.all([eligibleSettlementOrders(db, sellerId, until), pendingAdjustments(db, sellerId)]);
  if (!orders.length) throw new CommerceError("nothing_to_settle");
  const currency = orders[0].currency;
  const sum = (f: (o: Order) => number) => orders.reduce((a, o) => a + f(o), 0);
  const adj = (f: (a: (typeof adjustments)[number]) => number) => adjustments.reduce((a, x) => a + f(x), 0);
  const netCents = sum((o) => o.sellerNetCents) + adj((a) => a.netCents);
  if (netCents <= 0) throw new CommerceError("adjustments_exceed_payout");
  const periodStart = new Date(Math.min(...orders.map((o) => o.paidAt!.getTime())));
  const adjustmentNote = adjustments.length ? `[deducted] ${adjustments.length} refund adjustment(s): ${formatMoney(adj((a) => a.netCents), currency)}` : "";
  return db.transaction(async (tx) => {
    const [settlement] = await tx
      .insert(s.settlements)
      .values({
        sellerId,
        periodStart,
        periodEnd: until,
        currency,
        orderCount: orders.length,
        grossCents: sum((o) => o.totalCents) + adj((a) => a.grossCents),
        commissionCents: sum((o) => o.commissionCents) + adj((a) => a.commissionCents),
        netCents,
        memo: [memo, adjustmentNote].filter(Boolean).join("\n") || undefined,
        createdBy: viewer.user.id,
      })
      .returning();
    // Guard against two admins batching the same orders concurrently.
    const claimed = await tx
      .update(s.orders)
      .set({ settlementId: settlement.id })
      .where(and(inArray(s.orders.id, orders.map((o) => o.id)), isNull(s.orders.settlementId), eq(s.orders.status, "paid"), ne(s.orders.refundStatus, "requested")))
      .returning({ id: s.orders.id });
    if (claimed.length !== orders.length) throw new CommerceError("invalid_state", "orders already settled or refunded");
    if (adjustments.length) {
      // Adjustments are consumed by this batch; cancelling the batch releases them again.
      const merged = await tx
        .update(s.settlements)
        .set({ status: "paid", paidAt: new Date(), reference: mergedRef(settlement.id) })
        .where(and(inArray(s.settlements.id, adjustments.map((a) => a.id)), eq(s.settlements.status, "pending")))
        .returning({ id: s.settlements.id });
      if (merged.length !== adjustments.length) throw new CommerceError("invalid_state", "adjustments already deducted");
    }
    return settlement;
  });
}

export async function markSettlementPaid(db: DB, viewer: Viewer, settlementId: string, reference: string) {
  const [row] = await db.select().from(s.settlements).where(eq(s.settlements.id, settlementId));
  if (!row || row.status !== "pending" || isAdjustmentSettlement(row)) throw new CommerceError("invalid_state");
  if (row.netCents <= 0) throw new CommerceError("nothing_to_pay_out");
  // `merged:` marks a deduction consumed by a batch; an admin must not be able to forge one through this field.
  if (/^merged:/i.test(reference.trim())) throw new CommerceError("reference_reserved");
  // The status is in the WHERE so a batch cancelled or recomputed in the meantime is never flipped to paid.
  const [paid] = await db
    .update(s.settlements)
    .set({ status: "paid", paidAt: new Date(), reference: reference.slice(0, 200) })
    .where(and(eq(s.settlements.id, settlementId), eq(s.settlements.status, "pending"), eq(s.settlements.netCents, row.netCents)))
    .returning({ id: s.settlements.id });
  if (!paid) throw new CommerceError("invalid_state");
  const [seller] = await db.select({ email: s.users.email }).from(s.sellers).innerJoin(s.users, eq(s.users.id, s.sellers.userId)).where(eq(s.sellers.id, row.sellerId));
  if (seller) await sendMail(db, seller.email, "Ringo payout sent", `A payout of ${formatMoney(row.netCents, row.currency)} for ${row.orderCount} orders has been sent.\nReference: ${reference}`, "payout_paid");
  void viewer;
}

export async function cancelSettlement(db: DB, settlementId: string) {
  const [row] = await db.select().from(s.settlements).where(eq(s.settlements.id, settlementId));
  if (!row || row.status !== "pending") throw new CommerceError("invalid_state");
  await db.transaction(async (tx) => {
    await tx.update(s.orders).set({ settlementId: null }).where(eq(s.orders.settlementId, settlementId));
    await tx.update(s.settlements).set({ status: "cancelled" }).where(eq(s.settlements.id, settlementId));
    // Refund deductions merged into this batch go back to pending so the next payout applies them.
    await releaseMergedAdjustments(tx, settlementId);
  });
}
