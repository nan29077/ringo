import "server-only";
import { and, eq, gt, ilike, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import * as s from "@/db/schema";
import type { DB } from "./db";
import type { Viewer } from "./auth";
import { CommerceError, addOrderEvent, adjustmentSettlementWhere } from "./commerce";
import { getSettings } from "./settings";
import { likeQ, one, periodWhere, type SP } from "./list";
import { newOrderNo } from "./ids";

/* ------------------------------------------------------------------ shared helpers (super-admin console) */

export const enumOpts = (m: Record<string, { en: string; ko: string }>, skip: string[] = []) =>
  Object.entries(m).filter(([k]) => !skip.includes(k)).map(([value, v]) => ({ value, en: v.en, ko: v.ko }));

export const major = (c: number | null | undefined) => ((c ?? 0) / 100).toFixed(2);
export const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 2 : 0)}%`;

const ORDER = ["pending_payment", "paid", "refunded", "cancelled", "expired"];
const FULFILL = ["not_required", "pending", "in_progress", "delivered"];
const REFUND = ["none", "requested", "rejected", "refunded"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Latest (successful first) payment provider for an order, as a correlated subquery. */
export const orderProviderSql = sql<string | null>`(select p.provider from payments p where p.order_id = ${s.orders.id} order by (p.status = 'succeeded') desc, p.created_at desc limit 1)`;

/** WHERE for the admin order list + CSV export. */
export function adminOrderWhere(sp: SP) {
  const q = one(sp, "q").trim().slice(0, 100);
  const basis = one(sp, "basis") === "paid" ? s.orders.paidAt : s.orders.createdAt;
  const where: (SQL | undefined)[] = [periodWhere(basis, sp)];
  if (q) {
    const l = likeQ(q);
    where.push(or(ilike(s.orders.orderNo, l), ilike(s.orders.buyerName, l), ilike(s.orders.buyerEmail, l), ilike(s.orders.productTitle, l), ilike(s.sellers.displayName, l)));
  }
  const st = one(sp, "status");
  if (ORDER.includes(st)) where.push(eq(s.orders.status, st as s.OrderStatus));
  const f = one(sp, "fulfillment");
  if (FULFILL.includes(f)) where.push(eq(s.orders.fulfillmentStatus, f as s.FulfillmentStatus));
  const r = one(sp, "refund");
  if (REFUND.includes(r)) where.push(eq(s.orders.refundStatus, r as s.RefundStatus));
  const seller = one(sp, "seller");
  if (UUID.test(seller)) where.push(eq(s.orders.sellerId, seller));
  const buyer = one(sp, "buyer");
  if (UUID.test(buyer)) where.push(eq(s.orders.buyerId, buyer));
  const provider = one(sp, "provider").slice(0, 40);
  if (provider) where.push(sql`exists (select 1 from payments p where p.order_id = ${s.orders.id} and p.provider = ${provider})`);
  const source = one(sp, "source").slice(0, 80);
  if (source === "admin_grant") where.push(eq(s.orders.source, "admin_grant"));
  return and(...where);
}

/* ------------------------------------------------------------------ members */

export function memberWhere(sp: SP) {
  const q = one(sp, "q").trim().slice(0, 100);
  const where: (SQL | undefined)[] = [periodWhere(s.users.createdAt, sp)];
  if (q) where.push(or(ilike(s.users.name, likeQ(q)), ilike(s.users.email, likeQ(q)), ilike(s.users.phone, likeQ(q)), ilike(s.sellers.displayName, likeQ(q))));
  const role = one(sp, "role");
  if (["buyer", "seller", "admin"].includes(role)) where.push(eq(s.users.role, role as s.UserRole));
  const st = one(sp, "status");
  if (["active", "suspended", "withdrawn"].includes(st)) where.push(eq(s.users.status, st as s.UserStatus));
  const v = one(sp, "verified");
  if (v === "yes") where.push(isNotNull(s.users.emailVerifiedAt));
  if (v === "no") where.push(isNull(s.users.emailVerifiedAt));
  const mk = one(sp, "marketing");
  if (mk === "yes" || mk === "no") where.push(eq(s.users.marketingOptIn, mk === "yes"));
  return and(...where);
}

/** Per-buyer order aggregates, joined into the member list (one grouped subquery, no N+1). */
export function buyerOrderAgg(db: DB) {
  return db
    .select({
      buyerId: s.orders.buyerId,
      orders: sql<number>`count(*)::int`.as("orders_n"),
      paidOrders: sql<number>`count(*) filter (where ${s.orders.paidAt} is not null)::int`.as("paid_n"),
      paidCents: sql<number>`coalesce(sum(${s.orders.totalCents}) filter (where ${s.orders.status} = 'paid'),0)::int`.as("paid_cents"),
    })
    .from(s.orders)
    .groupBy(s.orders.buyerId)
    .as("oa");
}

export async function activeAdminCount(db: DB, exceptUserId?: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.users)
    .where(and(eq(s.users.role, "admin"), eq(s.users.status, "active"), exceptUserId ? ne(s.users.id, exceptUserId) : undefined));
  return row?.n ?? 0;
}

/**
 * Manually grants a product to a member: zero-amount paid order (source "admin_grant"),
 * a succeeded "manual" payment, an active entitlement and an order event.
 */
export async function grantEntitlement(db: DB, viewer: Viewer, userId: string, productId: string, reason: string) {
  if (viewer.user.role !== "admin") throw new CommerceError("forbidden");
  if (!reason.trim()) throw new CommerceError("reason_required");
  const [user] = await db.select().from(s.users).where(eq(s.users.id, userId));
  const [product] = await db.select().from(s.products).where(eq(s.products.id, productId));
  if (!user || !product) throw new CommerceError("not_found");
  const owned = await db
    .select({ id: s.entitlements.id })
    .from(s.entitlements)
    .where(and(eq(s.entitlements.userId, userId), eq(s.entitlements.productId, productId), eq(s.entitlements.status, "active")));
  if (owned.length) throw new CommerceError("already_owned");
  const now = new Date();
  const order = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(s.orders)
      .values({
        orderNo: newOrderNo(),
        buyerId: user.id,
        productId: product.id,
        sellerId: product.sellerId,
        productTitle: product.titleEn,
        status: "paid",
        currency: product.currency,
        subtotalCents: 0,
        discountCents: 0,
        totalCents: 0,
        commissionBps: 0,
        commissionCents: 0,
        sellerNetCents: 0,
        source: "admin_grant",
        medium: "admin",
        buyerEmail: user.email,
        buyerName: user.name,
        fulfillmentStatus: "not_required",
        idempotencyKey: `admin-grant-${crypto.randomUUID()}`,
        adminMemo: `Manual grant by ${viewer.user.email}: ${reason.trim()}`.slice(0, 4000),
        paidAt: now,
      })
      .returning();
    await tx.insert(s.payments).values({ orderId: order.id, provider: "manual", providerRef: `admin:${viewer.user.id}`, method: "admin_grant", status: "succeeded", amountCents: 0, currency: order.currency });
    await tx.insert(s.entitlements).values({ userId: user.id, productId: product.id, orderId: order.id });
    await tx.insert(s.orderEvents).values({ orderId: order.id, type: "admin_grant", message: `Access granted manually by admin: ${reason.trim().slice(0, 200)}`, actorId: viewer.user.id, actorRole: viewer.user.role });
    return order;
  });
  return order;
}

export async function revokeEntitlement(db: DB, viewer: Viewer, entitlementId: string, reason: string) {
  if (viewer.user.role !== "admin") throw new CommerceError("forbidden");
  if (!reason.trim()) throw new CommerceError("reason_required");
  const [ent] = await db.select().from(s.entitlements).where(eq(s.entitlements.id, entitlementId));
  if (!ent || ent.status !== "active") throw new CommerceError("invalid_state");
  await db.update(s.entitlements).set({ status: "revoked", revokedAt: new Date() }).where(eq(s.entitlements.id, entitlementId));
  await addOrderEvent(db, ent.orderId, "entitlement_revoked", `Access revoked by admin: ${reason.trim().slice(0, 200)}`, viewer);
  return ent;
}

/* ------------------------------------------------------------------ sellers */

/** Aggregates per seller for the seller list (grouped subqueries). */
export function sellerProductAgg(db: DB) {
  return db
    .select({
      sellerId: s.products.sellerId,
      total: sql<number>`count(*)::int`.as("products_total"),
      published: sql<number>`count(*) filter (where ${s.products.status} = 'published')::int`.as("products_published"),
    })
    .from(s.products)
    .groupBy(s.products.sellerId)
    .as("pa");
}

export function sellerOrderAgg(db: DB, since: Date) {
  return db
    .select({
      sellerId: s.orders.sellerId,
      sales30: sql<number>`coalesce(sum(${s.orders.totalCents}) filter (where ${s.orders.paidAt} >= ${since.toISOString()}::timestamptz),0)::int`.as("sales30"),
      orders30: sql<number>`count(*) filter (where ${s.orders.paidAt} >= ${since.toISOString()}::timestamptz)::int`.as("orders30"),
      unsettled: sql<number>`coalesce(sum(${s.orders.sellerNetCents}) filter (where ${s.orders.status} = 'paid' and ${s.orders.settlementId} is null),0)::int`.as("unsettled"),
    })
    .from(s.orders)
    .groupBy(s.orders.sellerId)
    .as("sa");
}

/**
 * Payout overview for every seller that has unsettled paid orders.
 * Eligibility mirrors `eligibleSettlementOrders` in commerce.ts (paid, unsettled, past the refund window,
 * no open refund request, delivered or instant). The actual batch is always built by `createSettlement`.
 */
export async function payoutOverview(db: DB) {
  const settings = await getSettings(db);
  const cutoff = new Date(Date.now() - settings.commerce.refundWindowDays * 86400000);
  const eligible = sql`(${s.orders.paidAt} <= ${cutoff.toISOString()}::timestamptz and ${s.orders.refundStatus} <> 'requested' and ${s.orders.fulfillmentStatus} in ('not_required','delivered'))`;
  const orderRows = await db
    .select({
      sellerId: s.orders.sellerId,
      availableN: sql<number>`count(*) filter (where ${eligible})::int`,
      availableCents: sql<number>`coalesce(sum(${s.orders.sellerNetCents}) filter (where ${eligible}),0)::int`,
      holdingN: sql<number>`count(*) filter (where not ${eligible})::int`,
      holdingCents: sql<number>`coalesce(sum(${s.orders.sellerNetCents}) filter (where not ${eligible}),0)::int`,
      currency: sql<string>`min(${s.orders.currency})`,
    })
    .from(s.orders)
    // Free orders have nothing to pay out and never become eligible, so they are left out of the queue.
    .where(and(eq(s.orders.status, "paid"), isNull(s.orders.settlementId), gt(s.orders.totalCents, 0)))
    .groupBy(s.orders.sellerId);
  // A seller can owe a refund deduction while having no unsettled orders at all: keep them in the queue.
  const adjustmentRows = await db
    .select({ sellerId: s.settlements.sellerId, n: sql<number>`count(*)::int`, cents: sql<number>`coalesce(sum(${s.settlements.netCents}),0)::int` })
    .from(s.settlements)
    .where(and(eq(s.settlements.status, "pending"), adjustmentSettlementWhere))
    .groupBy(s.settlements.sellerId);
  const aMap = new Map(adjustmentRows.map((x) => [x.sellerId, x]));
  const blank = { availableN: 0, availableCents: 0, holdingN: 0, holdingCents: 0, currency: settings.site.currency };
  const rows = [...new Set([...orderRows.map((r) => r.sellerId), ...adjustmentRows.map((r) => r.sellerId)])].map(
    (sellerId) => orderRows.find((r) => r.sellerId === sellerId) ?? { sellerId, ...blank },
  );
  const ids = rows.map((r) => r.sellerId);
  const [sellerRows, lastPaid] = await Promise.all([
    ids.length
      ? db.select({ seller: s.sellers, email: s.users.email }).from(s.sellers).innerJoin(s.users, eq(s.users.id, s.sellers.userId)).where(inArray(s.sellers.id, ids))
      : Promise.resolve([]),
    ids.length
      ? db
          .select({
            sellerId: s.settlements.sellerId,
            lastPaidAt: sql<Date | null>`max(${s.settlements.paidAt})`.mapWith((v) => (v ? new Date(v) : null)),
            pendingN: sql<number>`count(*) filter (where ${s.settlements.status} = 'pending')::int`,
          })
          .from(s.settlements)
          .where(inArray(s.settlements.sellerId, ids))
          .groupBy(s.settlements.sellerId)
      : Promise.resolve([]),
  ]);
  const sMap = new Map(sellerRows.map((x) => [x.seller.id, x]));
  const pMap = new Map(lastPaid.map((x) => [x.sellerId, x]));
  return {
    settings,
    rows: rows
      .map((r) => {
        const adj = aMap.get(r.sellerId);
        return {
          ...r,
          // Refunds of already-paid-out orders are deducted from the next payout.
          adjustmentN: adj?.n ?? 0,
          adjustmentCents: adj?.cents ?? 0,
          availableCents: r.availableCents + (adj?.cents ?? 0),
          seller: sMap.get(r.sellerId)?.seller,
          email: sMap.get(r.sellerId)?.email,
          lastPaidAt: pMap.get(r.sellerId)?.lastPaidAt ?? null,
          pendingSettlements: (pMap.get(r.sellerId)?.pendingN ?? 0) - (adj?.n ?? 0),
        };
      })
      .filter((r) => r.seller)
      .sort((a, b) => b.availableCents - a.availableCents || b.holdingCents - a.holdingCents),
  };
}

export function settlementWhere(sp: SP) {
  const where: (SQL | undefined)[] = [periodWhere(s.settlements.createdAt, sp)];
  const st = one(sp, "status");
  if (["pending", "paid", "cancelled"].includes(st)) where.push(eq(s.settlements.status, st as "pending"));
  const seller = one(sp, "seller");
  if (UUID.test(seller)) where.push(eq(s.settlements.sellerId, seller));
  const q = one(sp, "q").trim().slice(0, 100);
  if (q) where.push(or(ilike(s.sellers.displayName, likeQ(q)), ilike(s.settlements.reference, likeQ(q)), ilike(s.settlements.memo, likeQ(q))));
  return and(...where);
}

/* ------------------------------------------------------------------ payments */

export function paymentWhere(sp: SP) {
  const where: (SQL | undefined)[] = [periodWhere(s.payments.createdAt, sp)];
  const provider = one(sp, "provider").slice(0, 40);
  if (provider) where.push(eq(s.payments.provider, provider));
  const st = one(sp, "status");
  if (["pending", "succeeded", "failed", "cancelled", "refunded"].includes(st)) where.push(eq(s.payments.status, st as s.PaymentStatus));
  const q = one(sp, "q").trim().slice(0, 100);
  if (q) where.push(or(ilike(s.orders.orderNo, likeQ(q)), ilike(s.payments.providerRef, likeQ(q)), ilike(s.orders.buyerEmail, likeQ(q))));
  return and(...where);
}

export async function knownProviders(db: DB) {
  const rows = await db.selectDistinct({ provider: s.payments.provider }).from(s.payments).orderBy(s.payments.provider);
  const set = new Set(["test", "pearpay", "nextpay", "free", "manual", ...rows.map((r) => r.provider)]);
  return [...set];
}

