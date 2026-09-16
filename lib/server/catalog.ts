import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import type { DB } from "./db";
import type { Viewer } from "./auth";
import { CommerceError } from "./commerce";
import { getSettings } from "./settings";
import { slugify } from "./ids";
import { randomCode } from "./ids";
import { sendMail } from "./mail";
import { storage } from "./storage";

type Product = typeof s.products.$inferSelect;

const money = z.coerce.number().min(0).max(100000).transform((v) => Math.round(v * 100));
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));

/** Shared product form schema (admin + seller). Prices are entered in major units (e.g. 19.99). */
export const productInput = z.object({
  titleEn: z.string().trim().min(1).max(140),
  titleKo: z.string().trim().min(1).max(140),
  categoryId: z.string().min(1),
  slug: z.string().trim().max(80).optional(),
  summaryEn: optionalText(300),
  summaryKo: optionalText(300),
  descriptionEn: z.string().trim().max(20000).default(""),
  descriptionKo: z.string().trim().max(20000).default(""),
  formatLabel: optionalText(120),
  price: money,
  compareAt: z.union([z.literal(""), money]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  deliveryDays: z.union([z.literal(""), z.coerce.number().int().min(1).max(180)]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  lessons: z.string().max(10000).optional(),
  coverKey: optionalText(300),
  seoTitle: optionalText(160),
  seoDescription: optionalText(300),
});

export function parseLessons(raw: string | undefined, previous: s.Lesson[] = []): s.Lesson[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, 200).map((l) => ({
        title: String(l.title ?? "").slice(0, 200),
        assetId: l.assetId ? String(l.assetId) : null,
        minutes: l.minutes ? Math.max(0, Math.min(999, Number(l.minutes) || 0)) : null,
        preview: !!l.preview,
      })).filter((l) => l.title);
    }
  } catch {
    /* plain text fallback */
  }
  return raw.split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 200).map((title, i) => ({ title: title.slice(0, 200), assetId: previous[i]?.assetId ?? null }));
}

async function uniqueSlug(db: DB, wanted: string, exceptId?: string) {
  const base = slugify(wanted);
  let candidate = base;
  for (let i = 0; i < 20; i++) {
    const rows = await db.select({ id: s.products.id }).from(s.products).where(and(eq(s.products.slug, candidate), exceptId ? ne(s.products.id, exceptId) : undefined));
    if (!rows.length) return candidate;
    candidate = `${base}-${randomCode(4).toLowerCase()}`;
  }
  throw new CommerceError("slug_taken");
}

export function canEditProduct(viewer: Viewer, product: Pick<Product, "sellerId">) {
  return viewer.user.role === "admin" || (viewer.seller?.status === "active" && viewer.seller.id === product.sellerId);
}

export async function getProductForActor(db: DB, viewer: Viewer, productId: string) {
  const [product] = await db.select().from(s.products).where(eq(s.products.id, productId));
  if (!product || !canEditProduct(viewer, product)) throw new CommerceError("not_found");
  return product;
}

/**
 * Create or update a product. Sellers editing a published product keep it on sale
 * (content changes are logged); moderation decisions stay with admins.
 */
export async function saveProduct(db: DB, viewer: Viewer, raw: Record<string, unknown>, opts: { productId?: string; sellerId?: string }) {
  const input = productInput.parse(raw);
  const [category] = await db.select().from(s.categories).where(eq(s.categories.id, input.categoryId));
  if (!category) throw new CommerceError("not_found", "category");
  const existing = opts.productId ? await getProductForActor(db, viewer, opts.productId) : null;
  const sellerId = existing?.sellerId ?? (viewer.user.role === "admin" ? opts.sellerId : viewer.seller?.id);
  if (!sellerId) throw new CommerceError("forbidden");
  if (!existing && viewer.user.role !== "admin" && viewer.seller?.status !== "active") throw new CommerceError("forbidden");
  const deliveryType = category.deliveryType;
  const values = {
    titleEn: input.titleEn,
    titleKo: input.titleKo,
    categoryId: category.id,
    deliveryType,
    deliveryDays: deliveryType === "service" ? input.deliveryDays ?? 7 : null,
    summaryEn: input.summaryEn,
    summaryKo: input.summaryKo,
    descriptionEn: input.descriptionEn,
    descriptionKo: input.descriptionKo,
    formatLabel: input.formatLabel,
    priceCents: input.price,
    compareAtCents: input.compareAt && input.compareAt > input.price ? input.compareAt : null,
    lessons: deliveryType === "course" ? parseLessons(input.lessons, existing?.lessons) : [],
    coverKey: input.coverKey ?? existing?.coverKey ?? "preset:book",
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
    updatedAt: new Date(),
  };
  if (existing) {
    const slug = input.slug && input.slug !== existing.slug ? await uniqueSlug(db, input.slug, existing.id) : existing.slug;
    const [row] = await db.update(s.products).set({ ...values, slug }).where(eq(s.products.id, existing.id)).returning();
    return row;
  }
  const settings = await getSettings(db);
  const [row] = await db
    .insert(s.products)
    .values({ ...values, sellerId, slug: await uniqueSlug(db, input.slug || input.titleEn), currency: settings.site.currency, status: "draft" })
    .returning();
  return row;
}

/** Seller submits a draft/rejected product. Auto-publishes when moderation is off or when an admin submits. */
export async function submitProduct(db: DB, viewer: Viewer, productId: string) {
  const product = await getProductForActor(db, viewer, productId);
  if (!["draft", "rejected"].includes(product.status)) throw new CommerceError("invalid_state");
  const assets = await db.select({ id: s.productAssets.id }).from(s.productAssets).where(eq(s.productAssets.productId, productId));
  if (product.deliveryType === "download" || product.deliveryType === "collection") {
    if (!assets.length) throw new CommerceError("file_required");
  }
  const settings = await getSettings(db);
  const publish = viewer.user.role === "admin" || settings.moderation.autoApproveProducts;
  await db.update(s.products).set({
    status: publish ? "published" : "pending_review",
    submittedAt: new Date(),
    publishedAt: publish ? new Date() : product.publishedAt,
    rejectReason: null,
    updatedAt: new Date(),
  }).where(eq(s.products.id, productId));
  return publish ? "published" : "pending_review";
}

export async function reviewProduct(db: DB, viewer: Viewer, productId: string, decision: "approve" | "reject", reason?: string) {
  if (viewer.user.role !== "admin") throw new CommerceError("forbidden");
  const [row] = await db.select({ product: s.products, email: s.users.email }).from(s.products).innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId)).innerJoin(s.users, eq(s.users.id, s.sellers.userId)).where(eq(s.products.id, productId));
  if (!row || row.product.status !== "pending_review") throw new CommerceError("invalid_state");
  if (decision === "reject" && !reason?.trim()) throw new CommerceError("reason_required");
  await db.update(s.products).set({
    status: decision === "approve" ? "published" : "rejected",
    rejectReason: decision === "reject" ? reason!.trim().slice(0, 1000) : null,
    publishedAt: decision === "approve" ? new Date() : row.product.publishedAt,
    updatedAt: new Date(),
  }).where(eq(s.products.id, productId));
  await sendMail(db, row.email, decision === "approve" ? `"${row.product.titleEn}" is now on sale` : `"${row.product.titleEn}" needs changes`, decision === "approve" ? "Your product was approved and is now visible on Ringo." : `Your product was not approved.\nReason: ${reason}\nEdit the product and submit it again.`, "product_review");
}

/** Status changes available outside of review. */
export async function setProductStatus(db: DB, viewer: Viewer, productId: string, status: "draft" | "suspended" | "archived" | "published", reason?: string) {
  const product = await getProductForActor(db, viewer, productId);
  const admin = viewer.user.role === "admin";
  if (status === "suspended" && !admin) throw new CommerceError("forbidden");
  if (status === "published") {
    // Sellers can re-open products they paused (draft) only if previously approved; admins can always publish.
    if (!admin && !(product.status === "draft" && product.publishedAt)) throw new CommerceError("forbidden");
    if (!admin && product.status === "suspended") throw new CommerceError("forbidden");
  }
  if (!admin && product.status === "suspended") throw new CommerceError("forbidden");
  await db.update(s.products).set({ status, rejectReason: status === "suspended" ? reason?.slice(0, 1000) ?? null : product.rejectReason, publishedAt: status === "published" ? product.publishedAt ?? new Date() : product.publishedAt, updatedAt: new Date() }).where(eq(s.products.id, productId));
}

export async function deleteProductAsset(db: DB, viewer: Viewer, assetId: string) {
  const [asset] = await db.select().from(s.productAssets).where(eq(s.productAssets.id, assetId));
  if (!asset) throw new CommerceError("not_found");
  await getProductForActor(db, viewer, asset.productId);
  const sold = await db.select({ id: s.orders.id }).from(s.orders).where(and(eq(s.orders.productId, asset.productId), eq(s.orders.status, "paid"))).limit(1);
  await db.delete(s.productAssets).where(eq(s.productAssets.id, assetId));
  // Keep the object when buyers already purchased — they may still need earlier versions via support.
  if (!sold.length) await (await storage()).remove(asset.storageKey).catch(() => {});
}
