import "server-only";
import { and, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import * as s from "@/db/schema";
import type { DB } from "./db";
import { startOfZonedDaysAgo } from "@/lib/time";
import { likeQ, one, periodWhere, type SP } from "./list";

const productStatuses = ["draft", "pending_review", "published", "rejected", "suspended", "archived"];

/**
 * WHERE for the admin product list filters (q, status, category, seller, visible, min, max, period).
 * Requires `sellers` to be joined (search covers the seller display name). Mirrors app/admin/products/page.tsx.
 */
export function adminProductWhere(sp: SP) {
  const q = one(sp, "q").trim().slice(0, 100);
  const where: (SQL | undefined)[] = [periodWhere(s.products.createdAt, sp)];
  if (q) where.push(or(ilike(s.products.titleEn, likeQ(q)), ilike(s.products.titleKo, likeQ(q)), ilike(s.products.slug, likeQ(q)), ilike(s.sellers.displayName, likeQ(q))));
  const status = one(sp, "status");
  if (productStatuses.includes(status)) where.push(eq(s.products.status, status as s.ProductStatus));
  if (one(sp, "category")) where.push(eq(s.products.categoryId, one(sp, "category")));
  if (/^[0-9a-f-]{36}$/i.test(one(sp, "seller"))) where.push(eq(s.products.sellerId, one(sp, "seller")));
  if (one(sp, "visible")) where.push(eq(s.products.visible, one(sp, "visible") === "yes"));
  const min = Number(one(sp, "min"));
  const max = Number(one(sp, "max"));
  if (one(sp, "min") && Number.isFinite(min)) where.push(gte(s.products.priceCents, Math.round(min * 100)));
  if (one(sp, "max") && Number.isFinite(max)) where.push(lte(s.products.priceCents, Math.round(max * 100)));
  return and(...where);
}

/** products.rating_avg = round(avg(rating) × 10) over visible reviews, null when none. */
export async function recomputeProductRating(db: DB, productId: string) {
  const [row] = await db
    .select({ avg: sql<number | null>`round(avg(${s.productReviews.rating}) * 10)::int` })
    .from(s.productReviews)
    .where(and(eq(s.productReviews.productId, productId), eq(s.productReviews.hidden, false)));
  await db.update(s.products).set({ ratingAvg: row?.avg ?? null }).where(eq(s.products.id, productId));
  return row?.avg ?? null;
}

export const RANGE_PRESETS = [7, 30, 90, 365] as const;

/** Analytics range (?range=7|30|90|365, default 30) → days and local start-of-day matching `dailySales`. */
export function analyticsRange(sp: SP, fallback = 30) {
  const n = Number(one(sp, "range"));
  const days = (RANGE_PRESETS as readonly number[]).includes(n) ? n : fallback;
  return { days, from: startOfZonedDaysAgo(days - 1) };
}

export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Compact JSON for log tables. */
export function compactJson(v: unknown, max = 160) {
  if (v === null || v === undefined) return "";
  const text = JSON.stringify(v);
  return text.length > max ? text.slice(0, max) + "…" : text;
}
