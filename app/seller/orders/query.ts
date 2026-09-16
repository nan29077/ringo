import "server-only";
import { and, eq, ilike, or, type SQL } from "drizzle-orm";
import * as s from "@/db/schema";
import { likeQ, one, periodWhere, type SP } from "@/lib/server/list";

const ORDER = ["pending_payment", "paid", "refunded", "cancelled", "expired"];
const FULFILL = ["not_required", "pending", "in_progress", "delivered"];
const REFUND = ["none", "requested", "rejected", "refunded"];

/** Shared WHERE for the seller order list and CSV export. Always scoped to the seller. */
export function sellerOrderWhere(sellerId: string, sp: SP) {
  const q = one(sp, "q").trim().slice(0, 100);
  const where: (SQL | undefined)[] = [eq(s.orders.sellerId, sellerId), periodWhere(s.orders.createdAt, sp)];
  if (q) where.push(or(ilike(s.orders.orderNo, likeQ(q)), ilike(s.orders.buyerName, likeQ(q)), ilike(s.orders.buyerEmail, likeQ(q)), ilike(s.orders.productTitle, likeQ(q))));
  const st = one(sp, "status");
  if (ORDER.includes(st)) where.push(eq(s.orders.status, st as s.OrderStatus));
  const f = one(sp, "fulfillment");
  if (FULFILL.includes(f)) where.push(eq(s.orders.fulfillmentStatus, f as s.FulfillmentStatus));
  const r = one(sp, "refund");
  if (REFUND.includes(r)) where.push(eq(s.orders.refundStatus, r as s.RefundStatus));
  return and(...where);
}
