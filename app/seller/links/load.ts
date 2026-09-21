import "server-only";
import { and, eq, gt, isNull, or } from "drizzle-orm";
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
    // Only coupons that saving would accept: active and not expired. A product-only coupon is labelled
    // with its product, since attaching it to a link for another product is refused.
    db
      .select({ code: s.coupons.code, name: s.coupons.name, productId: s.coupons.productId, productKo: s.products.titleKo, productEn: s.products.titleEn })
      .from(s.coupons)
      .leftJoin(s.products, eq(s.products.id, s.coupons.productId))
      .where(and(eq(s.coupons.sellerId, sellerId), eq(s.coupons.active, true), or(isNull(s.coupons.endsAt), gt(s.coupons.endsAt, new Date()))))
      .orderBy(s.coupons.code),
  ]);
  const list = coupons.map((c) => ({ code: c.code, name: c.name, productId: c.productId, productKo: c.productKo, productEn: c.productEn }));
  if (current?.couponCode && !list.some((c) => c.code === current.couponCode)) list.unshift({ code: current.couponCode, name: "—", productId: null, productKo: null, productEn: null });
  return { products, coupons: list };
}
