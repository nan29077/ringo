import "server-only";
import { and, count, desc, eq, gt, inArray, isNull, not, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import type { DB } from "./db";
import { adjustmentSettlementWhere, eligibleSettlementOrders, pendingAdjustments } from "./commerce";
import { getSettings } from "./settings";
import { toZonedInput } from "@/lib/time";

type Order = typeof s.orders.$inferSelect;

export type HoldReason = "refund_requested" | "not_delivered" | "refund_window";

/** Why an unsettled paid order is not yet part of a payout. */
export function holdReasons(order: Order, refundWindowDays: number, now = Date.now()): { reasons: HoldReason[]; releaseAt: Date | null } {
  const reasons: HoldReason[] = [];
  if (order.refundStatus === "requested") reasons.push("refund_requested");
  if (order.fulfillmentStatus === "pending" || order.fulfillmentStatus === "in_progress") reasons.push("not_delivered");
  const releaseAt = order.paidAt ? new Date(order.paidAt.getTime() + refundWindowDays * 86400000) : null;
  if (releaseAt && releaseAt.getTime() > now) reasons.push("refund_window");
  return { reasons, releaseAt };
}

/** Seller balance: unsettled paid orders split into payout-eligible vs holding, plus settlement totals. */
export async function sellerBalance(db: DB, sellerId: string) {
  const settings = await getSettings(db);
  const [unsettled, eligible, totals, adjustments] = await Promise.all([
    db.select().from(s.orders).where(and(eq(s.orders.sellerId, sellerId), eq(s.orders.status, "paid"), isNull(s.orders.settlementId), gt(s.orders.totalCents, 0))).orderBy(desc(s.orders.paidAt)),
    eligibleSettlementOrders(db, sellerId, new Date()),
    db
      .select({ status: s.settlements.status, cents: sql<number>`coalesce(sum(${s.settlements.netCents}),0)::int`, n: count() })
      .from(s.settlements)
      .where(and(eq(s.settlements.sellerId, sellerId), not(adjustmentSettlementWhere)))
      .groupBy(s.settlements.status),
    pendingAdjustments(db, sellerId),
  ]);
  const eligibleIds = new Set(eligible.map((o) => o.id));
  const holding = unsettled.filter((o) => !eligibleIds.has(o.id));
  const sum = (rows: Order[]) => rows.reduce((a, o) => a + o.sellerNetCents, 0);
  const byStatus = (st: string) => totals.find((x) => x.status === st) ?? { cents: 0, n: 0 };
  const adjustmentCents = adjustments.reduce((a, x) => a + x.netCents, 0);
  return {
    refundWindowDays: settings.commerce.refundWindowDays,
    minPayoutCents: settings.commerce.minPayoutCents,
    currency: settings.site.currency,
    // Includes pending refund deductions, so this equals available + holding.
    unsettledCents: sum(unsettled) + adjustmentCents,
    /** Refunds of orders that were already paid out; deducted from the next payout (negative). */
    adjustments: { cents: adjustmentCents, count: adjustments.length, rows: adjustments },
    available: { cents: sum(eligible) + adjustmentCents, count: eligible.length, orders: eligible },
    holding: { cents: sum(holding), count: holding.length, orders: holding },
    paidOut: byStatus("paid"),
    awaitingTransfer: byStatus("pending"),
  };
}

/** Counts for the seller console navigation badges / attention list. */
export async function sellerCounts(db: DB, sellerId: string) {
  const n = async (q: Promise<{ v: number }[]>) => (await q)[0]?.v ?? 0;
  const [pendingService, overdueService, refundRequests, openInquiries, rejectedProducts, inReview] = await Promise.all([
    n(db.select({ v: count() }).from(s.orders).where(and(eq(s.orders.sellerId, sellerId), eq(s.orders.status, "paid"), inArray(s.orders.fulfillmentStatus, ["pending", "in_progress"])))),
    n(db.select({ v: count() }).from(s.orders).where(and(eq(s.orders.sellerId, sellerId), eq(s.orders.status, "paid"), inArray(s.orders.fulfillmentStatus, ["pending", "in_progress"]), sql`${s.orders.dueAt} < now()`))),
    n(db.select({ v: count() }).from(s.orders).where(and(eq(s.orders.sellerId, sellerId), eq(s.orders.refundStatus, "requested"), eq(s.orders.status, "paid")))),
    n(db.select({ v: count() }).from(s.inquiries).where(and(eq(s.inquiries.sellerId, sellerId), eq(s.inquiries.status, "open")))),
    n(db.select({ v: count() }).from(s.products).where(and(eq(s.products.sellerId, sellerId), eq(s.products.status, "rejected")))),
    n(db.select({ v: count() }).from(s.products).where(and(eq(s.products.sellerId, sellerId), eq(s.products.status, "pending_review")))),
  ]);
  return { pendingService, overdueService, refundRequests, openInquiries, rejectedProducts, inReview };
}

/** Date → value for <input type="datetime-local"> in the site timezone (matches `parseZonedInput`). */
export const toLocalInput = toZonedInput;

export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
