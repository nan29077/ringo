"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { CommerceError } from "@/lib/server/commerce";
import { recomputeProductRating } from "@/lib/server/admin-catalog";

export async function setReviewHidden(reviewId: string, hidden: boolean): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const id = z.string().uuid().parse(reviewId);
    const value = z.boolean().parse(hidden);
    const [review] = await db.select().from(s.productReviews).where(eq(s.productReviews.id, id));
    if (!review) throw new CommerceError("not_found");
    if (review.hidden === value) throw new CommerceError("invalid_state");
    await db.update(s.productReviews).set({ hidden: value }).where(eq(s.productReviews.id, id));
    const ratingAvg = await recomputeProductRating(db, review.productId);
    await audit(db, viewer, value ? "review.hide" : "review.unhide", "review", id, { productId: review.productId, rating: review.rating, ratingAvg });
    return { ok: true, message: value ? t("Review hidden from the store.", "구매평을 숨겼습니다.") : t("Review is visible again.", "구매평을 다시 공개했습니다.") };
  }, "ko");
}
