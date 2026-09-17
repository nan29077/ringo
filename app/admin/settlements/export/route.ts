import { desc, eq } from "drizzle-orm";
import { zonedDateKey, zonedStamp } from "@/lib/time";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { csvResponse, type SP } from "@/lib/server/list";
import { major, settlementWhere } from "@/lib/server/admin-ops";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const viewer = await requireAdmin();
  const db = await getDb();
  const sp: SP = Object.fromEntries(new URL(request.url).searchParams);
  const rows = await db
    .select({ st: s.settlements, x: s.sellers })
    .from(s.settlements)
    .innerJoin(s.sellers, eq(s.sellers.id, s.settlements.sellerId))
    .where(settlementWhere(sp))
    .orderBy(desc(s.settlements.createdAt))
    .limit(50000);
  await audit(db, viewer, "settlement.export", "settlement", undefined, { filters: sp, rows: rows.length });
  return csvResponse(`ringo-settlements-${zonedDateKey()}.csv`, [
    ["settlement_id", "created_at", "seller", "seller_slug", "period_start", "period_end", "orders", "currency", "gross", "commission", "net_payout", "status", "reference", "paid_at", "payout_method", "bank", "account_name", "account_number", "memo"],
    ...rows.map(({ st, x }) => [
      st.id, zonedStamp(st.createdAt), x.displayName, x.slug, st.periodStart.toISOString(), st.periodEnd.toISOString(), st.orderCount, st.currency,
      major(st.grossCents), major(st.commissionCents), major(st.netCents), st.status, st.reference ?? "", zonedStamp(st.paidAt),
      x.payoutMethod ?? "", x.payoutBankName ?? "", x.payoutAccountName ?? "", x.payoutAccountNumber ?? "", st.memo ?? "",
    ]),
  ]);
}
