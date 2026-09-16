import "server-only";
import { and, eq, or } from "drizzle-orm";
import * as s from "@/db/schema";
import type { DB } from "@/lib/server/db";

/** Products a seller may link (on sale, plus the currently linked one) and the seller's own coupons. */
export async function linkFormOptions(db: DB, sellerId: string, current?: { productId: string; couponCode: string | null }) {
  const [products, coupons] = await Promise.all([
    db
      .select({ id: s.products.id, titleEn: s.products.titleEn, titleKo: s.products.titleKo })
      .from(s.products)
      .where(and(eq(s.products.sellerId, sellerId), current ? or(eq(s.products.status, "published"), eq(s.products.id, current.productId)) : eq(s.products.status, "published")))
      .orderBy(s.products.titleEn),
    db.select({ code: s.coupons.code, name: s.coupons.name }).from(s.coupons).where(and(eq(s.coupons.sellerId, sellerId), eq(s.coupons.active, true))).orderBy(s.coupons.code),
  ]);
  if (current?.couponCode && !coupons.some((c) => c.code === current.couponCode)) coupons.unshift({ code: current.couponCode, name: "—" });
  return { products, coupons };
}
