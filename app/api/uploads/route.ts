import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { getViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { IMAGE_TYPES, maxUploadBytes, newStorageKey, storage } from "@/lib/server/storage";
import { flagContentChange, getProductForActor } from "@/lib/server/catalog";
import { getOrderForActor } from "@/lib/server/commerce";
import { audit } from "@/lib/server/audit";
import { rateLimit } from "@/lib/server/request";
import { getT } from "@/lib/server/i18n-server";

export const runtime = "nodejs";

const kinds = ["cover", "banner", "avatar", "product-asset", "deliverable"] as const;
type Kind = (typeof kinds)[number];

/**
 * Multipart upload (field "file" + "kind", optional "productId" / "orderId").
 * Covers/banners/avatars → public/ (served by /media). Product files & deliverables → private/ (entitlement-checked downloads).
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  // Every upload kind comes from a console (seller center or admin), which defaults to Korean; the
  // message is shown in the uploader's toast, so it follows the console language.
  const { t } = await getT("ko");
  if (!rateLimit(`upload:${viewer.user.id}`, 60, 10 * 60000)) return NextResponse.json({ error: t("Too many uploads. Try again in a few minutes.", "업로드가 너무 많습니다. 잠시 후 다시 시도하세요.") }, { status: 429 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const kind = String(form?.get("kind") || "") as Kind;
  if (!form || !(file instanceof File) || !kinds.includes(kind)) return NextResponse.json({ error: t("Choose a file to upload.", "업로드할 파일을 선택하세요.") }, { status: 400 });
  const isImage = kind === "cover" || kind === "banner" || kind === "avatar";
  const limit = isImage ? 10 * 1024 * 1024 : maxUploadBytes();
  const mb = Math.round(limit / 1048576);
  if (file.size === 0) return NextResponse.json({ error: t("The file is empty.", "빈 파일입니다.") }, { status: 413 });
  if (file.size > limit) return NextResponse.json({ error: t(`The file is too large. The limit is ${mb} MB.`, `파일이 너무 큽니다. 최대 ${mb}MB까지 올릴 수 있습니다.`) }, { status: 413 });
  if (isImage && !IMAGE_TYPES.includes(file.type)) return NextResponse.json({ error: t("Use a JPG, PNG, WebP or GIF image.", "JPG, PNG, WebP, GIF 이미지만 올릴 수 있습니다.") }, { status: 415 });
  const db = await getDb();

  try {
    if (kind === "banner" && viewer.user.role !== "admin") throw new Error("forbidden");
    if (kind === "cover" || kind === "avatar") {
      if (viewer.user.role !== "admin" && viewer.seller?.status !== "active") throw new Error("forbidden");
    }
    let productId: string | null = null;
    let orderId: string | null = null;
    if (kind === "product-asset") {
      productId = String(form.get("productId") || "");
      const product = await getProductForActor(db, viewer, productId);
      // A suspended product is under admin action: sellers cannot keep changing what buyers would receive.
      if (product.status === "suspended" && viewer.user.role !== "admin") throw new Error("forbidden");
      // Adding a file to a product already on sale changes what buyers receive: flag it for review.
      await flagContentChange(db, viewer, product);
    }
    if (kind === "deliverable") {
      orderId = String(form.get("orderId") || "");
      const order = await getOrderForActor(db, viewer, orderId);
      if (order.status !== "paid") throw new Error("forbidden");
    }
    const prefix = kind === "cover" ? "public/covers" : kind === "banner" ? "public/banners" : kind === "avatar" ? "public/avatars" : kind === "product-asset" ? "private/assets" : "private/deliverables";
    const key = newStorageKey(prefix, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    await (await storage()).put(key, buffer, file.type || "application/octet-stream");
    const filename = file.name.replace(/[\\/\r\n"]/g, "_").slice(0, 200);
    const contentType = file.type || "application/octet-stream";

    if (kind === "product-asset" && productId) {
      const [asset] = await db.insert(s.productAssets).values({ productId, storageKey: key, filename, contentType, bytes: file.size }).returning();
      await db.update(s.products).set({ updatedAt: new Date() }).where(eq(s.products.id, productId));
      await audit(db, viewer, "product.asset_upload", "product", productId, { filename, bytes: file.size });
      return NextResponse.json({ id: asset.id, key, filename, bytes: file.size });
    }
    if (kind === "deliverable" && orderId) {
      const [row] = await db.insert(s.orderDeliverables).values({ orderId, storageKey: key, filename, contentType, bytes: file.size, uploadedBy: viewer.user.id }).returning();
      await db.insert(s.orderEvents).values({ orderId, type: "deliverable_uploaded", message: `File uploaded: ${filename}`, actorId: viewer.user.id, actorRole: viewer.user.role });
      return NextResponse.json({ id: row.id, key, filename, bytes: file.size });
    }
    return NextResponse.json({ key, url: `/media/${key}`, filename, bytes: file.size });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    const denied = message === "forbidden" || message === "not_found";
    return NextResponse.json({ error: denied ? t("You cannot upload here.", "이곳에는 업로드할 권한이 없습니다.") : t("Upload failed. Please try again.", "업로드에 실패했습니다. 다시 시도하세요.") }, { status: denied ? 403 : 500 });
  }
}
