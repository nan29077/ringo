import { desc, eq } from "drizzle-orm";
import { zonedDateKey, zonedStamp } from "@/lib/time";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { csvResponse } from "@/lib/server/list";
import { isAdjustmentSettlement } from "@/lib/server/commerce";

export const runtime = "nodejs";

const major = (c: number | null | undefined) => ((c ?? 0) / 100).toFixed(2);

/** The seller's own settlement history, for their bookkeeping. Only their rows, no other seller's data. */
export async function GET() {
  const viewer = await requireSeller();
  const db = await getDb();
  const rows = await db.select().from(s.settlements).where(eq(s.settlements.sellerId, viewer.seller.id)).orderBy(desc(s.settlements.createdAt)).limit(20000);
  return csvResponse(`ringo-payouts-${zonedDateKey()}.csv`, [
    ["settlement_id", "type", "created_at", "period_start", "period_end", "orders", "currency", "gross", "commission", "net_payout", "status", "reference", "paid_at"],
    ...rows.map((st) => {
      const adjustment = isAdjustmentSettlement(st);
      return [
        st.id, adjustment ? "refund_deduction" : "payout", zonedStamp(st.createdAt), adjustment ? "" : zonedStamp(st.periodStart), adjustment ? "" : zonedStamp(st.periodEnd), st.orderCount, st.currency,
        major(st.grossCents), major(st.commissionCents), major(st.netCents), st.status,
        // A merged deduction's reference is an internal pointer, not a bank transfer number.
        st.reference && !/^merged:/i.test(st.reference) ? st.reference : "", zonedStamp(st.paidAt),
      ];
    }),
  ]);
}
