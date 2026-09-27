import "server-only";
import { mailOrigin } from "./request";
import { and, eq, gte, inArray, isNull, lt, lte, ne, not, or, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import type { DB, Tx } from "./db";
import type { Viewer } from "./auth";
import { getSettings } from "./settings";
import { newOrderNo } from "./ids";
import { getProvider } from "./payments";
import { recipientLang } from "./mail";
import { notify } from "./notify";
import { logError } from "./audit";
import { formatMoney } from "../i18n";
import { zonedDateKey } from "../time";
import { recomputeRating } from "./storefront";

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
  // The caller holds a transaction through order insertion. Locking this row serializes every
  // reservation of the coupon, including the per-buyer and global limit checks below.
  const [coupon] = await db.select().from(s.coupons).where(eq(s.coupons.code, code.trim().toUpperCase())).for("update");
  const now = Date.now();
  if (!coupon || !coupon.active) throw new CommerceError("coupon_invalid");
  if (coupon.startsAt && coupon.startsAt.getTime() > now) throw new CommerceError("coupon_not_started");
  if (coupon.endsAt && coupon.endsAt.getTime() < now) throw new CommerceError("coupon_expired");
  if (coupon.sellerId && coupon.sellerId !== product.sellerId) throw new CommerceError("coupon_not_applicable");
  if (coupon.productId && coupon.productId !== product.id) throw new CommerceError("coupon_not_applicable");
  if (product.priceCents < coupon.minOrderCents) throw new CommerceError("coupon_min_order");
  // `usedCount` only rises when an order is PAID, so an unpaid order has to hold its use as well.
  // Without that hold a buyer could stack several unpaid orders — each one passing the limit check
  // because nothing has been paid yet — and then pay them all, using a one-per-buyer coupon N times.
  // The hold lasts exactly as long as the order can still be paid, so an abandoned order frees it.
  const settings = await getSettings(db);
  const holdFrom = new Date(now - settings.commerce.pendingPaymentMinutes * 60000);
  const heldWhere = and(eq(s.orders.status, "pending_payment"), gte(s.orders.createdAt, holdFrom));
  const [{ held }] = await db
    .select({ held: sql<number>`count(*)::int` })
    .from(s.orders)
    .where(and(eq(s.orders.couponId, coupon.id), heldWhere));
  if (coupon.usageLimit != null && coupon.usedCount + held >= coupon.usageLimit) throw new CommerceError("coupon_exhausted");
  const [{ used }] = await db
    .select({ used: sql<number>`count(*)::int` })
    .from(s.orders)
    .where(and(eq(s.orders.couponId, coupon.id), eq(s.orders.buyerId, buyerId), or(eq(s.orders.status, "paid"), heldWhere)));
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
  const order = await db.transaction((tx) => createOrderBody(tx as unknown as DB, viewer, input));
  if (order.totalCents === 0 && order.status === "pending_payment") {
    const [payment] = await db.select().from(s.payments).where(and(eq(s.payments.orderId, order.id), eq(s.payments.provider, "free")));
    if (payment) return confirmPayment(db, payment.id, { providerRef: "free" });
  }
  return order;
}

async function createOrderBody(
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

  // Never take money for a product that cannot deliver anything (its last file removed, a course with no lessons).
  if (product.deliveryType === "download" || product.deliveryType === "collection") {
    const [{ files }] = await db.select({ files: sql<number>`count(*)::int` }).from(s.productAssets).where(eq(s.productAssets.productId, product.id));
    if (!files) throw new CommerceError("product_unavailable");
  }
  if (product.deliveryType === "course" && !(product.lessons ?? []).length) throw new CommerceError("product_unavailable");
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
  // Coupon discounts are borne by the seller: the commission is charged on the list price, not on the
  // discounted amount, so a coupon never reduces the platform's share. It is capped at what the buyer
  // actually paid so the seller's payout can never go negative (e.g. a 100% coupon pays out nothing).
  const commissionCents = Math.min(Math.round((product.priceCents * commissionBps) / 10000), totalCents);
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
      productTitleKo: product.titleKo,
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
    await db.insert(s.payments).values({ orderId: order.id, provider: "free", status: "pending", amountCents: 0, currency: order.currency });
  }
  return order;
}

/** True when the order's product is still published and visible and its store is still active. */
async function isStillSellable(db: DB | Tx, order: Pick<Order, "productId" | "sellerId">) {
  const [row] = await db
    .select({ status: s.products.status, visible: s.products.visible, seller: s.sellers.status })
    .from(s.products)
    .innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId))
    .where(eq(s.products.id, order.productId));
  return !!row && row.status === "published" && row.visible && row.seller === "active";
}

export async function startPayment(db: DB, viewer: Viewer, orderId: string, providerId: string, origin: string) {
  const [order] = await db.select().from(s.orders).where(eq(s.orders.id, orderId));
  if (!order || order.buyerId !== viewer.user.id) throw new CommerceError("not_found");
  if (order.status !== "pending_payment") throw new CommerceError("order_not_payable");
  const settings = await getSettings(db);
  // The payment window is enforced here too, not only by the scheduled cleanup.
  if (await expireOrderIfStale(db, order, viewer)) throw new CommerceError("order_expired");
  // `createOrder` checked this, but the product or the store may have been suspended since.
  if (!(await isStillSellable(db, order))) throw new CommerceError("product_unavailable");
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
    // A repeated success callback must never reopen a payment that was already refunded.
    if (payment.status === "succeeded" || payment.status === "refunded") return { order, changed: false, delivered: false };
    if (payment.amountCents !== order.totalCents) throw new CommerceError("amount_mismatch");
    await tx.update(s.payments).set({ status: "succeeded", providerRef: info.providerRef ?? payment.providerRef, method: info.method ?? payment.method, raw: (info.raw as object) ?? null, updatedAt: new Date() }).where(eq(s.payments.id, payment.id));
    if (order.status !== "pending_payment") {
      // Paid after cancel/expiry: keep money traceable for manual refund.
      await tx.insert(s.orderEvents).values({ orderId: order.id, type: "late_payment", message: `Payment received while order was ${order.status}. Refund manually.` });
      return { order, changed: false, delivered: false };
    }
    const [product] = await tx.select().from(s.products).where(eq(s.products.id, order.productId)).for("update");
    const now = new Date();
    const service = product.deliveryType === "service";
    // The product or its store may have been suspended between checkout and this callback. The money
    // has already moved, so the order is still recorded as paid — otherwise it could never be refunded
    // through the normal tooling — but nothing is delivered and it is queued for a refund straight away.
    const sellable = await isStillSellable(tx, order);
    const duplicateAccess = !service && !!(await tx.select({ id: s.entitlements.id }).from(s.entitlements).where(and(eq(s.entitlements.userId, order.buyerId), eq(s.entitlements.productId, order.productId), eq(s.entitlements.status, "active"))).limit(1)).length;
    const deliver = sellable && !duplicateAccess;
    const [paid] = await tx
      .update(s.orders)
      .set({
        status: "paid",
        paidAt: now,
        updatedAt: now,
        fulfillmentStatus: deliver && service ? "pending" : "not_required",
        dueAt: deliver && service ? new Date(now.getTime() + (product.deliveryDays ?? 7) * 86400000) : null,
        ...(deliver ? {} : { refundStatus: "requested" as const, refundReason: duplicateAccess ? "Buyer already owns this product." : "Product or store was unavailable when the payment completed." }),
      })
      .where(eq(s.orders.id, order.id))
      .returning();
    if (deliver) {
      await tx.insert(s.entitlements).values({ userId: order.buyerId, productId: order.productId, orderId: order.id }).onConflictDoNothing();
      await tx.update(s.products).set({ salesCount: sql`${s.products.salesCount} + 1` }).where(eq(s.products.id, order.productId));
    }
    if (order.couponId) await tx.update(s.coupons).set({ usedCount: sql`${s.coupons.usedCount} + 1` }).where(eq(s.coupons.id, order.couponId));
    await tx.insert(s.orderEvents).values({ orderId: order.id, type: "paid", message: `Payment succeeded (${payment.provider})` });
    if (!deliver) {
      await tx.insert(s.orderEvents).values({ orderId: order.id, type: "refund_requested", message: "Product or store was unavailable at payment time. Nothing was delivered — refund this order." });
    }
    return { order: paid, changed: true, delivered: deliver };
  });
  if (result.changed) {
    // Close sibling checkouts after the payment transaction commits. Locking their orders inside it
    // could deadlock against another confirmation holding the sibling's payment and order locks.
    const siblings = await db.select({ id: s.orders.id }).from(s.orders).where(and(eq(s.orders.buyerId, result.order.buyerId), eq(s.orders.productId, result.order.productId), eq(s.orders.status, "pending_payment"), ne(s.orders.id, result.order.id)));
    for (const sibling of siblings) await closePendingOrder(db, sibling.id, "cancelled");
  }
  // A buyer who got nothing must not be told to open their library; the refund queue carries it instead.
  if (result.changed && result.delivered) await notifyPaid(db, result.order);
  return result.order;
}

export async function failPayment(db: DB, paymentId: string, reason: string, status: "failed" | "cancelled" = "failed") {
  await db.transaction(async (tx) => {
    const [payment] = await tx.select().from(s.payments).where(eq(s.payments.id, paymentId)).for("update");
    if (!payment || payment.status !== "pending") return;
    const changed = await tx.update(s.payments).set({ status, failureReason: reason.slice(0, 500), updatedAt: new Date() }).where(and(eq(s.payments.id, paymentId), eq(s.payments.status, "pending"))).returning({ id: s.payments.id });
    if (changed.length) await addOrderEvent(tx as unknown as DB, payment.orderId, "payment_failed", `Payment ${status}: ${reason}`);
  });
}

async function notifyPaid(db: DB, order: Order) {
  const [seller] = await db
    .select({ email: s.users.email, name: s.sellers.displayName, locale: s.users.locale })
    .from(s.sellers)
    .innerJoin(s.users, eq(s.users.id, s.sellers.userId))
    .where(eq(s.sellers.id, order.sellerId));
  const origin = await mailOrigin();
  const buyerLang = await recipientLang(db, { userId: order.buyerId });
  await notify(db, order.buyerEmail, "order_paid_buyer", buyerLang, {
    name: order.buyerName,
    orderNo: order.orderNo,
    product: buyerLang === "ko" ? order.productTitleKo || order.productTitle : order.productTitle,
    subtotal: order.discountCents ? formatMoney(order.subtotalCents, order.currency) : null,
    discount: order.discountCents ? formatMoney(order.discountCents, order.currency) : null,
    coupon: order.couponCode,
    total: formatMoney(order.totalCents, order.currency),
    libraryUrl: `${origin}/account/library`,
  });
  if (seller) {
    await notify(db, seller.email, "order_paid_seller", seller.locale, {
      store: seller.name,
      orderNo: order.orderNo,
      product: seller.locale === "ko" ? order.productTitleKo || order.productTitle : order.productTitle,
      net: formatMoney(order.sellerNetCents, order.currency),
      orderUrl: `${origin}/seller/orders/${order.id}`,
    });
  }
}

export async function cancelPendingOrder(db: DB, viewer: Viewer, orderId: string) {
  const [order] = await db.select().from(s.orders).where(eq(s.orders.id, orderId));
  if (!order) throw new CommerceError("not_found");
  if (viewer.user.role !== "admin" && order.buyerId !== viewer.user.id) throw new CommerceError("forbidden");
  const changed = await closePendingOrder(db, orderId, "cancelled", viewer);
  if (!changed) throw new CommerceError("order_not_cancellable");
}

/** Lock payment rows before the order, matching confirmPayment's lock order. */
async function closePendingOrder(db: DB, orderId: string, status: "cancelled" | "expired", viewer?: Viewer, cutoff?: Date) {
  return db.transaction(async (tx) => {
    await tx.select({ id: s.payments.id }).from(s.payments).where(eq(s.payments.orderId, orderId)).orderBy(s.payments.id).for("update");
    const [order] = await tx.select().from(s.orders).where(eq(s.orders.id, orderId)).for("update");
    if (!order || order.status !== "pending_payment" || (cutoff && order.createdAt > cutoff)) return false;
    const now = new Date();
    const changed = await tx.update(s.orders).set({ status, ...(status === "cancelled" ? { cancelledAt: now } : {}), updatedAt: now }).where(and(eq(s.orders.id, orderId), eq(s.orders.status, "pending_payment"))).returning({ id: s.orders.id });
    if (!changed.length) return false;
    await tx.update(s.payments).set({ status: "cancelled", failureReason: status, updatedAt: now }).where(and(eq(s.payments.orderId, orderId), eq(s.payments.status, "pending")));
    await addOrderEvent(tx as unknown as DB, orderId, status, status === "expired" ? "Payment window elapsed" : "Order cancelled before payment", viewer);
    return true;
  });
}

/**
 * Expires one pending order whose payment window has elapsed. Pages that show a pending order call this so
 * the buyer always sees the real state, instead of a payment form that can no longer be used.
 * Returns true when the order is (now) expired.
 */
export async function expireOrderIfStale(db: DB, order: Pick<Order, "id" | "status" | "createdAt">, viewer?: Viewer) {
  if (order.status !== "pending_payment") return order.status === "expired";
  const settings = await getSettings(db);
  if (order.createdAt.getTime() + settings.commerce.pendingPaymentMinutes * 60000 > Date.now()) return false;
  if (await closePendingOrder(db, order.id, "expired", viewer, new Date(Date.now() - settings.commerce.pendingPaymentMinutes * 60000))) return true;
  const [current] = await db.select({ status: s.orders.status }).from(s.orders).where(eq(s.orders.id, order.id));
  return current?.status === "expired";
}

export async function expireStaleOrders(db: DB) {
  const settings = await getSettings(db);
  const cutoff = new Date(Date.now() - settings.commerce.pendingPaymentMinutes * 60000);
  const stale = await db.select({ id: s.orders.id }).from(s.orders).where(and(eq(s.orders.status, "pending_payment"), lte(s.orders.createdAt, cutoff)));
  let expired = 0;
  for (const order of stale) if (await closePendingOrder(db, order.id, "expired", undefined, cutoff)) expired++;
  return expired;
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
  const buyerLang = await recipientLang(db, { userId: order.buyerId });
  await notify(db, order.buyerEmail, "order_delivered", buyerLang, {
    orderNo: order.orderNo,
    product: buyerLang === "ko" ? order.productTitleKo || order.productTitle : order.productTitle,
    note: note.trim(),
    orderUrl: `${await mailOrigin()}/account/orders/${order.id}`,
  });
}

export async function requestRefund(db: DB, viewer: Viewer, orderId: string, reason: string) {
  const [order] = await db.select().from(s.orders).where(eq(s.orders.id, orderId));
  if (!order || order.buyerId !== viewer.user.id) throw new CommerceError("not_found");
  if (order.status !== "paid" || !["none", "rejected"].includes(order.refundStatus)) throw new CommerceError("refund_not_allowed");
  const settings = await getSettings(db);
  if (order.paidAt && Date.now() - order.paidAt.getTime() > settings.commerce.refundWindowDays * 86400000) throw new CommerceError("refund_window_passed");
  if (!reason.trim()) throw new CommerceError("reason_required");
  await db.transaction(async (tx) => {
    const changed = await tx.update(s.orders).set({ refundStatus: "requested", refundReason: reason.trim().slice(0, 2000), refundRejectReason: null, updatedAt: new Date() })
      .where(and(eq(s.orders.id, orderId), eq(s.orders.status, "paid"), eq(s.orders.refundStatus, order.refundStatus)))
      .returning({ id: s.orders.id });
    if (!changed.length) throw new CommerceError("refund_not_allowed");
    await addOrderEvent(tx as unknown as DB, orderId, "refund_requested", `Refund requested: ${reason.trim().slice(0, 200)}`, viewer);
  });
}

export async function rejectRefund(db: DB, viewer: Viewer, orderId: string, reason: string) {
  const order = await getOrderForActor(db, viewer, orderId);
  if (order.refundStatus !== "requested") throw new CommerceError("invalid_state");
  if (!reason.trim()) throw new CommerceError("reason_required");
  await db.transaction(async (tx) => {
    const changed = await tx.update(s.orders).set({ refundStatus: "rejected", refundRejectReason: reason.trim().slice(0, 2000), updatedAt: new Date() })
      .where(and(eq(s.orders.id, orderId), eq(s.orders.status, "paid"), eq(s.orders.refundStatus, "requested")))
      .returning({ id: s.orders.id });
    if (!changed.length) throw new CommerceError("invalid_state");
    await addOrderEvent(tx as unknown as DB, orderId, "refund_rejected", `Refund rejected: ${reason.trim().slice(0, 200)}`, viewer);
  });
  await notify(db, order.buyerEmail, "refund_rejected", await recipientLang(db, { userId: order.buyerId }), { orderNo: order.orderNo, reason: reason.trim() });
}

/**
 * Full refund through the original payment provider. When the provider cannot refund automatically,
 * an admin may record a manual refund (already refunded in the PG console) with `manual: true`.
 */
export async function refundOrder(db: DB, viewer: Viewer, orderId: string, reason: string, opts: { manual?: boolean } = {}) {
  const order = await getOrderForActor(db, viewer, orderId);
  const latePayment = (order.status === "cancelled" || order.status === "expired") && viewer.user.role === "admin";
  const succeededPayments = await db.select().from(s.payments)
    .where(and(eq(s.payments.orderId, orderId), eq(s.payments.status, "succeeded")))
    .orderBy(s.payments.createdAt, s.payments.id);
  if (order.status === "paid" && succeededPayments.length > 1 && viewer.user.role !== "admin") throw new CommerceError("invalid_state");
  const extraPayment = viewer.user.role === "admin" && (order.status === "refunded" || (order.status === "paid" && succeededPayments.length > 1));
  if (order.status !== "paid" && !latePayment && !extraPayment) throw new CommerceError("invalid_state");
  if (viewer.user.role !== "admin" && order.refundStatus !== "requested") throw new CommerceError("refund_needs_request");
  if (opts.manual && viewer.user.role !== "admin") throw new CommerceError("forbidden");
  if (order.refundStatus === "processing" && !opts.manual) throw new CommerceError("invalid_state");
  if (!reason.trim()) throw new CommerceError("reason_required");
  // If another checkout settled for this order, refund the newest excess receipt first and keep
  // the original purchase and its entitlement intact. Refunded orders can receive a late callback too.
  const payment = extraPayment ? succeededPayments.at(-1) : succeededPayments[0];
  if (latePayment && !payment) throw new CommerceError("invalid_state");
  if (extraPayment && !payment) throw new CommerceError("invalid_state");
  const provider = payment && payment.provider !== "free" && order.totalCents > 0 && !opts.manual ? getProvider(payment.provider) : null;
  if (payment && payment.provider !== "free" && order.totalCents > 0 && !opts.manual && !provider?.isAvailable()) throw new CommerceError("provider_unavailable");
  // Claim the refund before calling an external provider. A second request cannot reach the PG.
  const [refund] = order.refundStatus === "processing"
    ? await db.select().from(s.refunds).where(and(eq(s.refunds.orderId, orderId), eq(s.refunds.status, "pending"))).orderBy(sql`${s.refunds.createdAt} desc`).limit(1)
    : await db.transaction(async (tx) => {
    const claimed = await tx.update(s.orders).set({ refundStatus: "processing", updatedAt: new Date() })
      .where(and(eq(s.orders.id, orderId), eq(s.orders.status, order.status), eq(s.orders.refundStatus, order.refundStatus), ne(s.orders.refundStatus, "processing")))
      .returning({ id: s.orders.id });
    if (!claimed.length) throw new CommerceError("invalid_state");
    const rows = await tx.insert(s.refunds).values({ orderId, paymentId: payment?.id, amountCents: payment?.amountCents ?? order.totalCents, reason: (opts.manual ? "[manual] " : "") + reason.trim(), status: "pending", processedBy: viewer.user.id }).returning();
    return rows;
  });
  if (!refund) throw new CommerceError("invalid_state");
  let providerRef: string | undefined;
  if (provider && payment) {
    try {
      providerRef = (await provider.refund({ providerRef: payment.providerRef, amountCents: payment.amountCents, currency: payment.currency, reason, idempotencyKey: `refund:${order.id}:${payment.id}` })).providerRef;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logError(db, `refund:${payment.provider}`, message, { orderId });
      await db.transaction(async (tx) => {
        await tx.update(s.refunds).set({ status: "failed" }).where(eq(s.refunds.id, refund.id));
        await tx.update(s.orders).set({ refundStatus: order.refundStatus, updatedAt: new Date() }).where(and(eq(s.orders.id, orderId), eq(s.orders.refundStatus, "processing")));
      });
      throw new CommerceError("refund_provider_error", message);
    }
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    const claimed = await tx
      .update(s.orders)
      .set(extraPayment
        ? { refundStatus: order.refundStatus, updatedAt: now }
        : { status: "refunded", refundStatus: "refunded", refundedCents: order.totalCents, refundedAt: now, updatedAt: now })
      .where(and(eq(s.orders.id, orderId), eq(s.orders.status, order.status), eq(s.orders.refundStatus, "processing")))
      .returning({ id: s.orders.id });
    if (!claimed.length) throw new CommerceError("invalid_state");
    const [current] = await tx.select().from(s.orders).where(eq(s.orders.id, orderId));
    await tx.update(s.refunds).set({ status: "succeeded", providerRef }).where(and(eq(s.refunds.id, refund.id), eq(s.refunds.status, "pending")));
    if (payment) await tx.update(s.payments).set({ status: "refunded", updatedAt: now }).where(eq(s.payments.id, payment.id));
    if (order.status === "paid" && !extraPayment) {
      await tx.update(s.entitlements).set({ status: "revoked", revokedAt: now }).where(eq(s.entitlements.orderId, orderId));
      await tx.update(s.products).set({ salesCount: sql`greatest(${s.products.salesCount} - 1, 0)` }).where(eq(s.products.id, order.productId));
      if (order.couponId) await tx.update(s.coupons).set({ usedCount: sql`greatest(${s.coupons.usedCount} - 1, 0)` }).where(eq(s.coupons.id, order.couponId));
      const hiddenReviews = await tx.update(s.productReviews).set({ hidden: true }).where(and(eq(s.productReviews.orderId, orderId), eq(s.productReviews.hidden, false))).returning({ id: s.productReviews.id });
      if (hiddenReviews.length) await recomputeRating(tx, order.productId);
    }
    await tx.insert(s.orderEvents).values({ orderId, type: "refunded", message: `${extraPayment ? "Additional payment refunded" : "Refunded"} ${formatMoney(payment?.amountCents ?? order.totalCents, order.currency)}${opts.manual ? " (manual)" : ""}: ${reason.slice(0, 200)}`, actorId: viewer.user.id, actorRole: viewer.user.role });
    if (order.status === "paid" && !extraPayment) await adjustSettlementForRefund(tx, current ?? order, viewer, now);
  });
  const buyerLang = await recipientLang(db, { userId: order.buyerId });
  await notify(db, order.buyerEmail, "refund_completed", buyerLang, {
    orderNo: order.orderNo,
    product: buyerLang === "ko" ? order.productTitleKo || order.productTitle : order.productTitle,
    amount: formatMoney(payment?.amountCents ?? order.totalCents, order.currency),
  });
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
    const note = `[refund] ${order.orderNo} removed ${zonedDateKey(now)}`;
    // The "[deducted]" line described deductions that have just been released, so it no longer applies.
    const kept = (settlement.memo ?? "").split("\n").filter((line) => !line.startsWith("[deducted]")).join("\n").trim();
    const memo = [kept, note].filter(Boolean).join("\n").slice(0, 2000);
    if (agg.n === 0 || agg.net <= 0) {
      // Nothing is left to pay out — the batch is empty, or what remains nets to zero or less (a deep
      // coupon leaves orders worth nothing to the seller). `markSettlementPaid` would refuse such a
      // batch forever while its orders stayed locked to it, so the batch is cancelled and they go
      // back into the pool for the next settlement.
      await tx.update(s.orders).set({ settlementId: null }).where(eq(s.orders.settlementId, settlement.id));
      await tx.update(s.settlements).set({ status: "cancelled", orderCount: 0, grossCents: 0, commissionCents: 0, netCents: 0, memo }).where(eq(s.settlements.id, settlement.id));
    } else {
      const [span] = await tx.select({ first: sql<Date | null>`min(${s.orders.paidAt})`.mapWith((v) => (v ? new Date(v) : null)) }).from(s.orders).where(eq(s.orders.settlementId, settlement.id));
      await tx
        .update(s.settlements)
        .set({ orderCount: agg.n, grossCents: agg.gross, commissionCents: agg.commission, netCents: agg.net, periodStart: span.first ?? settlement.periodStart, memo })
        .where(eq(s.settlements.id, settlement.id));
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

const noExcessReceipts = sql`(select count(*) from ${s.payments} p where p.order_id = ${s.orders.id} and p.status = 'succeeded') <= 1`;
const notOpenRefund = sql`${s.orders.refundStatus} not in ('requested', 'processing')`;

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
    .where(and(eq(s.orders.sellerId, sellerId), eq(s.orders.status, "paid"), isNull(s.orders.settlementId), lte(s.orders.paidAt, cutoff), notOpenRefund, noExcessReceipts));
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
  // The minimum is a promise shown to sellers on their payout page; small balances roll over to the next batch.
  const { commerce } = await getSettings(db);
  if (commerce.minPayoutCents > 0 && netCents < commerce.minPayoutCents) throw new CommerceError("below_min_payout");
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
      .where(and(inArray(s.orders.id, orders.map((o) => o.id)), isNull(s.orders.settlementId), eq(s.orders.status, "paid"), notOpenRefund, noExcessReceipts))
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
  // Batching excludes orders with an open refund request, but one can be opened after the batch was
  // created. Both consoles promise the buyer that such an order is held back, so honour that here.
  const [{ pendingRefunds }] = await db
    .select({ pendingRefunds: sql<number>`count(*)::int` })
    .from(s.orders)
    .where(and(eq(s.orders.settlementId, settlementId), or(inArray(s.orders.refundStatus, ["requested", "processing"]), not(noExcessReceipts))));
  if (pendingRefunds > 0) throw new CommerceError("refund_open_in_batch");
  // The status is in the WHERE so a batch cancelled or recomputed in the meantime is never flipped to paid.
  const [paid] = await db
    .update(s.settlements)
    .set({ status: "paid", paidAt: new Date(), reference: reference.slice(0, 200) })
    .where(and(eq(s.settlements.id, settlementId), eq(s.settlements.status, "pending"), eq(s.settlements.netCents, row.netCents)))
    .returning({ id: s.settlements.id });
  if (!paid) throw new CommerceError("invalid_state");
  const [seller] = await db.select({ email: s.users.email, locale: s.users.locale }).from(s.sellers).innerJoin(s.users, eq(s.users.id, s.sellers.userId)).where(eq(s.sellers.id, row.sellerId));
  if (seller) {
    await notify(db, seller.email, "payout_paid", seller.locale, {
      amount: formatMoney(row.netCents, row.currency),
      orderCount: row.orderCount,
      reference: reference.slice(0, 200),
    });
  }
  void viewer;
}

export async function cancelSettlement(db: DB, settlementId: string) {
  const [row] = await db.select().from(s.settlements).where(eq(s.settlements.id, settlementId));
  if (!row || row.status !== "pending") throw new CommerceError("invalid_state");
  await db.transaction(async (tx) => {
    // The status is in the WHERE, not only in the check above: without it a cancel that raced a
    // "mark paid" would strip the orders off an already-transferred payout and pay them out twice.
    const [cancelled] = await tx
      .update(s.settlements)
      .set({ status: "cancelled" })
      .where(and(eq(s.settlements.id, settlementId), eq(s.settlements.status, "pending")))
      .returning({ id: s.settlements.id });
    if (!cancelled) throw new CommerceError("invalid_state");
    await tx.update(s.orders).set({ settlementId: null }).where(eq(s.orders.settlementId, settlementId));
    // Refund deductions merged into this batch go back to pending so the next payout applies them.
    await releaseMergedAdjustments(tx, settlementId);
  });
}
