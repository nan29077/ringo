import { desc } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { csvResponse, type SP } from "@/lib/server/list";
import { sellerOrderWhere } from "../query";

export const runtime = "nodejs";

const major = (c: number | null | undefined) => ((c ?? 0) / 100).toFixed(2);

export async function GET(request: Request) {
  const viewer = await requireSeller();
  const db = await getDb();
  const sp: SP = Object.fromEntries(new URL(request.url).searchParams);
  const rows = await db.select().from(s.orders).where(sellerOrderWhere(viewer.seller.id, sp)).orderBy(desc(s.orders.createdAt)).limit(20000);
  return csvResponse(`ringo-orders-${new Date().toISOString().slice(0, 10)}.csv`, [
    ["order_no", "created_at", "paid_at", "status", "fulfillment", "refund_status", "product", "buyer_name", "buyer_email", "currency", "subtotal", "discount", "coupon", "total", "commission", "seller_net", "refunded", "source", "medium", "campaign", "due_at", "delivered_at", "settled"],
    ...rows.map((o) => [o.orderNo, o.createdAt.toISOString(), o.paidAt?.toISOString() ?? "", o.status, o.fulfillmentStatus, o.refundStatus, o.productTitle, o.buyerName, o.buyerEmail, o.currency, major(o.subtotalCents), major(o.discountCents), o.couponCode ?? "", major(o.totalCents), major(o.commissionCents), major(o.sellerNetCents), major(o.refundedCents), o.source ?? "", o.medium ?? "", o.campaign ?? "", o.dueAt?.toISOString() ?? "", o.deliveredAt?.toISOString() ?? "", o.settlementId ? "yes" : "no"]),
  ]);
}
