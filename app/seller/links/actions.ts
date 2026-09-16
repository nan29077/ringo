"use server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { CommerceError } from "@/lib/server/commerce";
import { saveLink, toggleLink } from "@/lib/server/links";

const id = z.string().uuid();

export async function sellerSaveLink(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireSeller();
    const db = await getDb();
    const { t } = await getT("ko");
    const linkId = fd.get("id") ? id.parse(String(fd.get("id"))) : undefined;
    const raw = Object.fromEntries(fd) as Record<string, unknown>;
    const productId = id.parse(String(raw.productId ?? ""));
    const [product] = await db.select().from(s.products).where(and(eq(s.products.id, productId), eq(s.products.sellerId, viewer.seller.id)));
    if (!product) throw new CommerceError("not_found");
    // New links (or moving a link to another product) require the product to be on sale.
    let productChanged = true;
    if (linkId) {
      const [link] = await db.select().from(s.deepLinks).where(and(eq(s.deepLinks.id, linkId), eq(s.deepLinks.sellerId, viewer.seller.id)));
      if (!link) throw new CommerceError("not_found");
      productChanged = link.productId !== productId;
    }
    if (productChanged && product.status !== "published") throw new CommerceError("product_unavailable");
    if (raw.couponCode) {
      const [c] = await db.select().from(s.coupons).where(eq(s.coupons.code, String(raw.couponCode).trim().toUpperCase()));
      if (!c || c.sellerId !== viewer.seller.id || (c.productId && c.productId !== productId)) throw new CommerceError("coupon_not_applicable");
    }
    if (linkId) delete raw.code;
    const row = await saveLink(db, viewer, raw, linkId);
    await audit(db, viewer, linkId ? "link.update" : "link.create", "deep_link", row.id, { code: row.code });
    return linkId ? { ok: true, message: t("Link saved.", "링크를 저장했습니다.") } : { ok: true, message: t("Link created.", "링크를 만들었습니다."), redirect: `/seller/links/${row.id}` };
  }, "ko");
}

export async function sellerToggleLink(linkId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireSeller();
    const db = await getDb();
    const { t } = await getT("ko");
    await toggleLink(db, viewer, id.parse(linkId));
    const [link] = await db.select({ status: s.deepLinks.status }).from(s.deepLinks).where(eq(s.deepLinks.id, linkId));
    await audit(db, viewer, "link.toggle", "deep_link", linkId, { status: link?.status });
    return { ok: true, message: link?.status === "active" ? t("Link resumed.", "링크를 다시 활성화했습니다.") : t("Link paused.", "링크를 일시중지했습니다.") };
  }, "ko");
}
