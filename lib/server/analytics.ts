import "server-only";
import { and, eq, gte, sql, type SQL } from "drizzle-orm";
import * as s from "@/db/schema";
import type { DB } from "./db";

export const TZ = process.env.REPORT_TIMEZONE || "Asia/Manila";

export function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000);
}

/** Paid sales grouped by local day (orders that were paid, including later-refunded ones as gross). */
export async function dailySales(db: DB, days: number, sellerId?: string) {
  const from = daysAgo(days - 1);
  const where: SQL[] = [sql`${s.orders.paidAt} is not null`, gte(s.orders.paidAt, new Date(from.toDateString()))];
  if (sellerId) where.push(eq(s.orders.sellerId, sellerId));
  const rows = await db
    .select({
      day: sql<string>`to_char(${s.orders.paidAt} at time zone ${sql.raw(`'${TZ}'`)}, 'YYYY-MM-DD')`,
      cents: sql<number>`coalesce(sum(${s.orders.totalCents}),0)::int`,
      net: sql<number>`coalesce(sum(${s.orders.sellerNetCents}),0)::int`,
      orders: sql<number>`count(*)::int`,
    })
    .from(s.orders)
    .where(and(...where))
    .groupBy(sql`1`);
  const map = new Map(rows.map((r) => [r.day, r]));
  const out: { date: string; cents: number; net: number; orders: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(daysAgo(i));
    const r = map.get(d);
    out.push({ date: d, cents: r?.cents ?? 0, net: r?.net ?? 0, orders: r?.orders ?? 0 });
  }
  return out;
}

export async function salesSummary(db: DB, from: Date, sellerId?: string) {
  const sellerWhere = sellerId ? eq(s.orders.sellerId, sellerId) : undefined;
  const [paid] = await db
    .select({
      gross: sql<number>`coalesce(sum(${s.orders.totalCents}),0)::int`,
      net: sql<number>`coalesce(sum(${s.orders.sellerNetCents}),0)::int`,
      commission: sql<number>`coalesce(sum(${s.orders.commissionCents}),0)::int`,
      discount: sql<number>`coalesce(sum(${s.orders.discountCents}),0)::int`,
      orders: sql<number>`count(*)::int`,
    })
    .from(s.orders)
    .where(and(gte(s.orders.paidAt, from), sellerWhere));
  const [refund] = await db
    .select({ cents: sql<number>`coalesce(sum(${s.orders.refundedCents}),0)::int`, count: sql<number>`count(*)::int`, net: sql<number>`coalesce(sum(${s.orders.sellerNetCents}),0)::int`, commission: sql<number>`coalesce(sum(${s.orders.commissionCents}),0)::int` })
    .from(s.orders)
    .where(and(gte(s.orders.refundedAt, from), sellerWhere));
  return { ...paid, refundCents: refund.cents, refundCount: refund.count, netAfterRefunds: paid.net - refund.net, commissionAfterRefunds: paid.commission - refund.commission, revenueAfterRefunds: paid.gross - refund.cents };
}
