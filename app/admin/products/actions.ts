"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { CommerceError } from "@/lib/server/commerce";
import { reviewProduct, saveProduct, setProductStatus, submitProduct, deleteProductAsset } from "@/lib/server/catalog";

const uuid = z.string().uuid();
const reasonText = z.string().trim().max(1000);

export async function approveProduct(id: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const productId = uuid.parse(id);
    await reviewProduct(db, viewer, productId, "approve");
    await audit(db, viewer, "product.approve", "product", productId, { from: "pending_review", to: "published" });
    revalidatePath("/admin", "layout");
    return { ok: true, message: t("Product approved and published.", "상품을 승인하고 판매를 시작했습니다.") };
  }, "ko");
}

export async function rejectProduct(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const id = uuid.parse(String(fd.get("id")));
    const reason = reasonText.min(1).parse(String(fd.get("reason") || ""));
    await reviewProduct(db, viewer, id, "reject", reason);
    await audit(db, viewer, "product.reject", "product", id, { from: "pending_review", to: "rejected", reason });
    revalidatePath("/admin", "layout");
    return { ok: true, message: t("Product rejected. The seller was notified.", "상품을 반려하고 판매자에게 알렸습니다.") };
  }, "ko");
}

export async function changeProductStatus(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const id = uuid.parse(String(fd.get("id")));
    const status = z.enum(["draft", "suspended", "archived", "published"]).parse(String(fd.get("status")));
    const reason = reasonText.parse(String(fd.get("reason") || ""));
    const [before] = await db.select({ status: s.products.status }).from(s.products).where(eq(s.products.id, id));
    if (!before) throw new CommerceError("not_found");
    if (status === "suspended" && !reason) throw new CommerceError("reason_required");
    if (status === before.status) throw new CommerceError("invalid_state");
    await setProductStatus(db, viewer, id, status, reason || undefined);
    await audit(db, viewer, "product.status", "product", id, { from: before.status, to: status, reason: reason || undefined });
    revalidatePath("/admin", "layout");
    const msg = {
      suspended: t("Selling suspended. The product is hidden from the store.", "판매를 중지했습니다. 스토어에서 숨겨집니다."),
      published: t("The product is on sale again.", "판매를 재개했습니다."),
      archived: t("Product archived.", "상품을 보관했습니다."),
      draft: t("Moved back to draft.", "임시저장 상태로 변경했습니다."),
    }[status];
    return { ok: true, message: msg };
  }, "ko");
}

export async function toggleProductFlag(id: string, flag: "visible" | "featured"): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const productId = uuid.parse(id);
    const which = z.enum(["visible", "featured"]).parse(flag);
    const [p] = await db.select().from(s.products).where(eq(s.products.id, productId));
    if (!p) throw new CommerceError("not_found");
    const value = which === "visible" ? !p.visible : !p.featured;
    await db.update(s.products).set(which === "visible" ? { visible: value } : { featured: value }).where(eq(s.products.id, productId));
    await audit(db, viewer, `product.${which}`, "product", productId, { value });
    return { ok: true };
  }, "ko");
}

export async function adminSaveProduct(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const id = fd.get("id") ? uuid.parse(String(fd.get("id"))) : undefined;
    let sellerId: string | undefined;
    if (!id) {
      sellerId = uuid.parse(String(fd.get("sellerId") || ""));
      const [seller] = await db.select({ status: s.sellers.status }).from(s.sellers).where(eq(s.sellers.id, sellerId));
      if (!seller || seller.status !== "active") throw new CommerceError("not_found", "seller");
    }
    const raw = Object.fromEntries(fd);
    delete raw.sellerId;
    const product = await saveProduct(db, viewer, raw, { productId: id, sellerId });
    await audit(db, viewer, id ? "product.update" : "product.create", "product", product.id, id ? { title: product.titleEn } : { title: product.titleEn, sellerId });
    return id
      ? { ok: true, message: t("Saved.", "저장했습니다.") }
      : { ok: true, message: t("Product created as a draft.", "상품을 임시저장 상태로 등록했습니다."), redirect: `/admin/products/${product.id}` };
  }, "ko");
}

export async function adminPublishDraft(id: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const productId = uuid.parse(id);
    const [before] = await db.select({ status: s.products.status }).from(s.products).where(eq(s.products.id, productId));
    if (!before) throw new CommerceError("not_found");
    const result = await submitProduct(db, viewer, productId);
    await audit(db, viewer, "product.publish", "product", productId, { from: before.status, to: result });
    revalidatePath("/admin", "layout");
    return { ok: true, message: t("The product is now on sale.", "상품 판매를 시작했습니다.") };
  }, "ko");
}

export async function adminDeleteAsset(assetId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const id = uuid.parse(assetId);
    const [asset] = await db.select().from(s.productAssets).where(eq(s.productAssets.id, id));
    if (!asset) throw new CommerceError("not_found");
    await deleteProductAsset(db, viewer, id);
    // Logged against the product so it shows in the product change history.
    await audit(db, viewer, "product.asset_delete", "product", asset.productId, { assetId: id, filename: asset.filename });
    return { ok: true, message: t("File deleted.", "파일을 삭제했습니다.") };
  }, "ko");
}
