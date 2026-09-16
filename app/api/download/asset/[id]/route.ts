import { and, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { getViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { canEditProduct } from "@/lib/server/catalog";
import { streamDownload } from "@/lib/server/downloads";
import { rateLimit, requestMeta } from "@/lib/server/request";

export const runtime = "nodejs";

/** Buyer download of a product file: requires an active entitlement (or seller/admin ownership). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const db = await getDb();
  const [row] = await db.select({ asset: s.productAssets, product: s.products }).from(s.productAssets).innerJoin(s.products, eq(s.products.id, s.productAssets.productId)).where(eq(s.productAssets.id, id));
  if (!row) return new Response("Not found", { status: 404 });
  let allowed = canEditProduct(viewer, row.product);
  if (!allowed) {
    const ent = await db.select({ id: s.entitlements.id }).from(s.entitlements).where(and(eq(s.entitlements.userId, viewer.user.id), eq(s.entitlements.productId, row.product.id), eq(s.entitlements.status, "active")));
    allowed = ent.length > 0;
  }
  if (!allowed) return new Response("Not found", { status: 404 });
  if (!rateLimit(`dl:${viewer.user.id}`, 120, 60 * 60000)) return new Response("Too many downloads, try later", { status: 429 });
  const meta = await requestMeta();
  await db.insert(s.downloadLogs).values({ userId: viewer.user.id, productId: row.product.id, assetId: id, ip: meta.ip });
  return streamDownload(row.asset.storageKey, row.asset.filename, row.asset.contentType);
}
