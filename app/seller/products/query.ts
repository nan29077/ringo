import "server-only";
import { and, eq, ilike, or, type SQL } from "drizzle-orm";
import * as s from "@/db/schema";
import { likeQ, one, periodWhere, type SP } from "@/lib/server/list";

/** Shared WHERE for the seller product list and its CSV export. Always scoped to the seller. */
export function sellerProductWhere(sellerId: string, sp: SP) {
  const q = one(sp, "q").trim().slice(0, 100);
  const where: (SQL | undefined)[] = [eq(s.products.sellerId, sellerId), periodWhere(s.products.createdAt, sp)];
  if (q) where.push(or(ilike(s.products.titleEn, likeQ(q)), ilike(s.products.titleKo, likeQ(q)), ilike(s.products.slug, likeQ(q))));
  const status = one(sp, "status");
  if (status && ["draft", "pending_review", "published", "rejected", "suspended", "archived"].includes(status)) where.push(eq(s.products.status, status as s.ProductStatus));
  if (one(sp, "category")) where.push(eq(s.products.categoryId, one(sp, "category")));
  return and(...where);
}
