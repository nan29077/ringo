import { desc, eq } from "drizzle-orm";
import { zonedDateKey, zonedStamp } from "@/lib/time";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { csvResponse, type SP } from "@/lib/server/list";
import { sellerProductWhere } from "../query";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const viewer = await requireSeller();
  const db = await getDb();
  const sp: SP = Object.fromEntries(new URL(request.url).searchParams);
  const rows = await db
    .select({ p: s.products, category: s.categories.nameEn })
    .from(s.products)
    .innerJoin(s.categories, eq(s.categories.id, s.products.categoryId))
    .where(sellerProductWhere(viewer.seller.id, sp))
    .orderBy(desc(s.products.updatedAt))
    .limit(10000);
  return csvResponse(`ringo-products-${zonedDateKey()}.csv`, [
    ["id", "slug", "title_en", "title_ko", "category", "delivery_type", "status", "price", "compare_at", "currency", "sales", "reject_reason", "created_at", "published_at"],
    ...rows.map(({ p, category }) => [p.id, p.slug, p.titleEn, p.titleKo, category, p.deliveryType, p.status, (p.priceCents / 100).toFixed(2), p.compareAtCents != null ? (p.compareAtCents / 100).toFixed(2) : "", p.currency, p.salesCount, p.rejectReason ?? "", zonedStamp(p.createdAt), zonedStamp(p.publishedAt)]),
  ]);
}
