import { desc, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { csvResponse, type SP } from "@/lib/server/list";
import { adminProductWhere } from "@/lib/server/admin-catalog";

export const runtime = "nodejs";

/** CSV of the admin product list honoring the same filters as /admin/products. */
export async function GET(request: Request) {
  const viewer = await requireAdmin();
  const db = await getDb();
  const sp: SP = Object.fromEntries(new URL(request.url).searchParams);
  const rows = await db
    .select({ p: s.products, seller: s.sellers.displayName, category: s.categories.nameEn })
    .from(s.products)
    .innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId))
    .innerJoin(s.categories, eq(s.categories.id, s.products.categoryId))
    .where(adminProductWhere(sp))
    .orderBy(desc(s.products.createdAt))
    .limit(20000);
  await audit(db, viewer, "product.export", "product", undefined, { filters: sp, rows: rows.length });
  return csvResponse(`ringo-admin-products-${new Date().toISOString().slice(0, 10)}.csv`, [
    ["id", "slug", "title_en", "title_ko", "seller", "category", "delivery_type", "status", "visible", "featured", "price", "compare_at", "currency", "sales", "rating", "reject_reason", "created_at", "submitted_at", "published_at"],
    ...rows.map(({ p, seller, category }) => [
      p.id, p.slug, p.titleEn, p.titleKo, seller, category, p.deliveryType, p.status, p.visible ? "Y" : "N", p.featured ? "Y" : "N",
      (p.priceCents / 100).toFixed(2), p.compareAtCents != null ? (p.compareAtCents / 100).toFixed(2) : "", p.currency, p.salesCount,
      p.ratingAvg != null ? (p.ratingAvg / 10).toFixed(1) : "", p.rejectReason ?? "", p.createdAt.toISOString(), p.submittedAt?.toISOString() ?? "", p.publishedAt?.toISOString() ?? "",
    ]),
  ]);
}
