"use server";
import { and, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { getViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { ActionError, run, type ActionResult } from "@/lib/server/action";
import { getT } from "@/lib/server/i18n-server";
import { CommerceError } from "@/lib/server/commerce";
import { isUuid, purchasableWhere } from "@/lib/server/storefront";

/** Save / unsave a product. Saving requires a purchasable product; removing always works. */
export async function toggleWishlist(productId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await getViewer();
    if (!viewer) throw new ActionError("forbidden");
    if (!isUuid(productId)) throw new CommerceError("not_found");
    const db = await getDb();
    const { t } = await getT();
    const [existing] = await db.select().from(s.wishlists).where(and(eq(s.wishlists.userId, viewer.user.id), eq(s.wishlists.productId, productId)));
    if (existing) {
      await db.delete(s.wishlists).where(and(eq(s.wishlists.userId, viewer.user.id), eq(s.wishlists.productId, productId)));
      return { ok: true, message: t("Removed from your wishlist", "관심 상품에서 삭제했습니다"), data: { saved: false } };
    }
    const [product] = await db.select({ id: s.products.id }).from(s.products).innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId)).where(and(eq(s.products.id, productId), purchasableWhere()));
    if (!product) throw new CommerceError("product_unavailable");
    await db.insert(s.wishlists).values({ userId: viewer.user.id, productId }).onConflictDoNothing();
    return { ok: true, message: t("Saved to your wishlist", "관심 상품에 저장했습니다"), data: { saved: true } };
  });
}
