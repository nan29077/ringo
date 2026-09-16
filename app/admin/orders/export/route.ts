import { desc, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { csvResponse, type SP } from "@/lib/server/list";
import { adminOrderWhere, major, orderProviderSql } from "@/lib/server/admin-ops";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const viewer = await requireAdmin();
  const db = await getDb();
  const sp: SP = Object.fromEntries(new URL(request.url).searchParams);
  const rows = await db
    .select({ o: s.orders, seller: s.sellers.displayName, provider: orderProviderSql })
    .from(s.orders)
    .innerJoin(s.sellers, eq(s.sellers.id, s.orders.sellerId))
    .where(adminOrderWhere(sp))
    .orderBy(desc(s.orders.createdAt))
    .limit(50000);
  await audit(db, viewer, "order.export", "order", undefined, { filters: sp, rows: rows.length });
  return csvResponse(`ringo-admin-orders-${new Date().toISOString().slice(0, 10)}.csv`, [
    ["order_no", "created_at", "paid_at", "status", "fulfillment", "refund_status", "product", "seller", "buyer_name", "buyer_email", "currency", "subtotal", "discount", "coupon", "total", "commission_bps", "commission", "seller_net", "refunded", "refunded_at", "provider", "source", "medium", "campaign", "due_at", "delivered_at", "settled"],
    ...rows.map(({ o, seller, provider }) => [
      o.orderNo, o.createdAt.toISOString(), o.paidAt?.toISOString() ?? "", o.status, o.fulfillmentStatus, o.refundStatus, o.productTitle, seller, o.buyerName, o.buyerEmail, o.currency,
      major(o.subtotalCents), major(o.discountCents), o.couponCode ?? "", major(o.totalCents), o.commissionBps, major(o.commissionCents), major(o.sellerNetCents), major(o.refundedCents), o.refundedAt?.toISOString() ?? "",
      provider ?? "", o.source ?? "", o.medium ?? "", o.campaign ?? "", o.dueAt?.toISOString() ?? "", o.deliveredAt?.toISOString() ?? "", o.settlementId ? "yes" : "no",
    ]),
  ]);
}
