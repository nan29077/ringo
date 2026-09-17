import "server-only";
import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import * as s from "@/db/schema";
import type { DB } from "./db";
import { likeQ } from "./list";
import type { Lang } from "../i18n";

/** A product buyers can see and purchase: published, visible and sold by an active seller. */
export const purchasableWhere = () => and(eq(s.products.status, "published"), eq(s.products.visible, true), eq(s.sellers.status, "active"))!;

export const SORTS = ["featured", "newest", "price-low", "price-high", "popular"] as const;
export type CatalogSort = (typeof SORTS)[number];

export const pick = (lang: Lang, en: string | null | undefined, ko: string | null | undefined) => (lang === "ko" ? ko || en : en || ko) ?? "";

const cardColumns = {
  id: s.products.id,
  slug: s.products.slug,
  titleEn: s.products.titleEn,
  titleKo: s.products.titleKo,
  summaryEn: s.products.summaryEn,
  summaryKo: s.products.summaryKo,
  categoryId: s.products.categoryId,
  categoryEn: s.categories.nameEn,
  categoryKo: s.categories.nameKo,
  deliveryType: s.products.deliveryType,
  deliveryDays: s.products.deliveryDays,
  formatLabel: s.products.formatLabel,
  coverKey: s.products.coverKey,
  priceCents: s.products.priceCents,
  compareAtCents: s.products.compareAtCents,
  currency: s.products.currency,
  ratingAvg: s.products.ratingAvg,
  featured: s.products.featured,
  salesCount: s.products.salesCount,
  sellerName: s.sellers.displayName,
  sellerSlug: s.sellers.slug,
  sellerId: s.sellers.id,
};
export type CardProduct = {
  id: string; slug: string; titleEn: string; titleKo: string; summaryEn: string | null; summaryKo: string | null;
  categoryId: string; categoryEn: string; categoryKo: string; deliveryType: s.DeliveryType; deliveryDays: number | null;
  formatLabel: string | null; coverKey: string | null; priceCents: number; compareAtCents: number | null; currency: string;
  ratingAvg: number | null; featured: boolean; salesCount: number; sellerName: string; sellerSlug: string; sellerId: string;
};

// Postgres sorts NULLs first on DESC: unrated / unpublished rows must not lead the list.
const published = sql`${s.products.publishedAt} desc nulls last`;
const rating = sql`${s.products.ratingAvg} desc nulls last`;

function orderFor(sort: CatalogSort) {
  switch (sort) {
    case "newest": return [published, desc(s.products.createdAt)];
    case "price-low": return [asc(s.products.priceCents), published];
    case "price-high": return [desc(s.products.priceCents), published];
    case "popular": return [desc(s.products.salesCount), rating, published];
    default: return [desc(s.products.featured), desc(s.products.salesCount), published];
  }
}

export async function listCatalog(db: DB, opts: { q?: string; category?: string; sort?: string; sellerId?: string; featured?: boolean; limit?: number; offset?: number; excludeIds?: string[] }) {
  const sort = (SORTS as readonly string[]).includes(opts.sort ?? "") ? (opts.sort as CatalogSort) : "featured";
  const conds: (SQL | undefined)[] = [purchasableWhere()];
  if (opts.category) conds.push(eq(s.products.categoryId, opts.category));
  if (opts.sellerId) conds.push(eq(s.products.sellerId, opts.sellerId));
  if (opts.featured) conds.push(eq(s.products.featured, true));
  if (opts.q) {
    const like = likeQ(opts.q);
    conds.push(or(ilike(s.products.titleEn, like), ilike(s.products.titleKo, like), ilike(s.products.summaryEn, like), ilike(s.products.summaryKo, like), ilike(s.sellers.displayName, like), ilike(s.products.formatLabel, like)));
  }
  if (opts.excludeIds?.length) conds.push(sql`${s.products.id} not in (${sql.join(opts.excludeIds.map((id) => sql`${id}`), sql`, `)})`);
  const where = and(...conds);
  const base = () => db.select(cardColumns).from(s.products).innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId)).innerJoin(s.categories, eq(s.categories.id, s.products.categoryId));
  const [rows, [{ total }]] = await Promise.all([
    base().where(where).orderBy(...orderFor(sort)).limit(opts.limit ?? 24).offset(opts.offset ?? 0),
    db.select({ total: count() }).from(s.products).innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId)).where(where),
  ]);
  return { rows: rows as CardProduct[], total, sort };
}

export async function activeCategories(db: DB) {
  return db.select().from(s.categories).where(eq(s.categories.active, true)).orderBy(asc(s.categories.sort), asc(s.categories.nameEn));
}

/** Purchasable product counts per category (for tabs). */
export async function categoryCounts(db: DB) {
  const rows = await db
    .select({ id: s.products.categoryId, n: count() })
    .from(s.products)
    .innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId))
    .where(purchasableWhere())
    .groupBy(s.products.categoryId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

export async function activeBanners(db: DB) {
  const now = new Date();
  return db
    .select()
    .from(s.banners)
    .where(and(eq(s.banners.active, true), or(isNull(s.banners.startsAt), lte(s.banners.startsAt, now)), or(isNull(s.banners.endsAt), gt(s.banners.endsAt, now))))
    .orderBy(asc(s.banners.sort), desc(s.banners.createdAt))
    .limit(8);
}

/** Active sellers that have at least one purchasable product, most products first. */
export async function highlightedSellers(db: DB, limit = 3) {
  return db
    .select({ id: s.sellers.id, slug: s.sellers.slug, displayName: s.sellers.displayName, bio: s.sellers.bio, avatarKey: s.sellers.avatarKey, products: count(s.products.id) })
    .from(s.sellers)
    .innerJoin(s.products, eq(s.products.sellerId, s.sellers.id))
    .where(purchasableWhere())
    .groupBy(s.sellers.id)
    .orderBy(desc(count(s.products.id)), asc(s.sellers.displayName))
    .limit(limit);
}

export async function wishlistIds(db: DB, userId: string | undefined, productIds?: string[]) {
  if (!userId) return new Set<string>();
  const rows = await db
    .select({ id: s.wishlists.productId })
    .from(s.wishlists)
    .where(and(eq(s.wishlists.userId, userId), productIds?.length ? inArray(s.wishlists.productId, productIds) : undefined));
  return new Set(rows.map((r) => r.id));
}

export async function activeEntitlement(db: DB, userId: string, productId: string) {
  const [row] = await db
    .select()
    .from(s.entitlements)
    .where(and(eq(s.entitlements.userId, userId), eq(s.entitlements.productId, productId), eq(s.entitlements.status, "active")))
    .orderBy(desc(s.entitlements.createdAt))
    .limit(1);
  return row ?? null;
}

/** Product + seller + category by slug, regardless of availability (callers decide). */
export async function productBySlug(db: DB, slug: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,120}$/i.test(slug)) return null;
  const [row] = await db
    .select({ product: s.products, seller: s.sellers, category: s.categories })
    .from(s.products)
    .innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId))
    .innerJoin(s.categories, eq(s.categories.id, s.products.categoryId))
    .where(eq(s.products.slug, slug.toLowerCase()));
  return row ?? null;
}

export function isPurchasable(row: { product: typeof s.products.$inferSelect; seller: typeof s.sellers.$inferSelect }) {
  return row.product.status === "published" && row.product.visible && row.seller.status === "active";
}

/** Recompute the ×10 rating average from non-hidden reviews. */
export async function recomputeRating(db: DB, productId: string) {
  const [{ avg }] = await db
    .select({ avg: sql<string | null>`avg(${s.productReviews.rating})` })
    .from(s.productReviews)
    .where(and(eq(s.productReviews.productId, productId), eq(s.productReviews.hidden, false)));
  const ratingAvg = avg == null ? null : Math.round(Number(avg) * 10);
  await db.update(s.products).set({ ratingAvg }).where(eq(s.products.id, productId));
  return ratingAvg;
}

export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** "Alex Morgan" → "Alex M." for public review bylines. */
export function publicName(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Ringo buyer";
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}
