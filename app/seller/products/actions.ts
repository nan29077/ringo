"use server";
import { z } from "zod";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { deleteProductAsset, getProductForActor, saveProduct, setProductStatus, submitProduct } from "@/lib/server/catalog";

const id = z.string().uuid();

export async function sellerSaveProduct(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireSeller();
    const db = await getDb();
    const { t } = await getT("ko");
    const productId = fd.get("id") ? id.parse(String(fd.get("id"))) : undefined;
    const raw = Object.fromEntries(fd);
    delete raw.sellerId; // never trust a client-provided owner
    const product = await saveProduct(db, viewer, raw, { productId });
    await audit(db, viewer, productId ? "product.update" : "product.create", "product", product.id, productId ? { title: product.titleEn, changed: (product as { changes?: unknown }).changes } : { title: product.titleEn });
    return productId
      ? { ok: true, message: t("Saved.", "저장했습니다.") }
      : { ok: true, message: t("Product saved as a draft. Upload files and submit it for review.", "임시저장했습니다. 파일을 올리고 심사를 요청하세요."), redirect: `/seller/products/${product.id}` };
  }, "ko");
}

export async function sellerSubmitProduct(productId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireSeller();
    const db = await getDb();
    const { t } = await getT("ko");
    const result = await submitProduct(db, viewer, id.parse(productId));
    await audit(db, viewer, "product.submit", "product", productId, { result });
    return { ok: true, message: result === "published" ? t("Product is now on sale.", "상품 판매를 시작했습니다.") : t("Submitted for review.", "심사를 요청했습니다.") };
  }, "ko");
}

export async function sellerSetProductStatus(productId: string, status: "draft" | "published" | "archived"): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireSeller();
    const db = await getDb();
    const { t } = await getT("ko");
    const next = z.enum(["draft", "published", "archived"]).parse(status);
    const product = await getProductForActor(db, viewer, id.parse(productId));
    await setProductStatus(db, viewer, product.id, next);
    await audit(db, viewer, "product.status", "product", product.id, { from: product.status, to: next });
    const msg = {
      draft: product.status === "published" ? t("Selling paused.", "판매를 일시중지했습니다.") : t("Moved back to draft.", "임시저장 상태로 변경했습니다."),
      published: t("Selling resumed.", "판매를 재개했습니다."),
      archived: t("Product archived.", "상품을 보관했습니다."),
    }[next];
    return { ok: true, message: msg };
  }, "ko");
}

export async function sellerDeleteAsset(assetId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireSeller();
    const db = await getDb();
    const { t } = await getT("ko");
    await deleteProductAsset(db, viewer, id.parse(assetId));
    await audit(db, viewer, "product.asset_delete", "product_asset", assetId);
    return { ok: true, message: t("File deleted.", "파일을 삭제했습니다.") };
  }, "ko");
}
