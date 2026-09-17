import { desc, eq } from "drizzle-orm";
import { zonedDateKey, zonedStamp } from "@/lib/time";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { csvResponse, type SP } from "@/lib/server/list";
import { buyerOrderAgg, major, memberWhere } from "@/lib/server/admin-ops";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const viewer = await requireAdmin();
  const db = await getDb();
  const sp: SP = Object.fromEntries(new URL(request.url).searchParams);
  const oa = buyerOrderAgg(db);
  const rows = await db
    .select({ u: s.users, store: s.sellers.displayName, storeStatus: s.sellers.status, orders: oa.orders, paidOrders: oa.paidOrders, paidCents: oa.paidCents })
    .from(s.users)
    .leftJoin(s.sellers, eq(s.sellers.userId, s.users.id))
    .leftJoin(oa, eq(oa.buyerId, s.users.id))
    .where(memberWhere(sp))
    .orderBy(desc(s.users.createdAt), s.users.email)
    .limit(50000);
  await audit(db, viewer, "member.export", "user", undefined, { filters: sp, rows: rows.length });
  return csvResponse(`ringo-members-${zonedDateKey()}.csv`, [
    ["name", "email", "phone", "role", "status", "email_verified", "marketing_opt_in", "store", "store_status", "orders", "paid_orders", "paid_total", "last_login_at", "joined_at"],
    ...rows.map(({ u, store, storeStatus, orders, paidOrders, paidCents }) => [
      u.name, u.email, u.phone ?? "", u.role, u.status, u.emailVerifiedAt ? "yes" : "no", u.marketingOptIn ? "yes" : "no", store ?? "", storeStatus ?? "",
      orders ?? 0, paidOrders ?? 0, major(paidCents), zonedStamp(u.lastLoginAt), zonedStamp(u.createdAt),
    ]),
  ]);
}
