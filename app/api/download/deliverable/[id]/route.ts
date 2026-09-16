import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { getViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { streamDownload } from "@/lib/server/downloads";

export const runtime = "nodejs";

/** Service deliverable: visible to the order's buyer, its seller and admins. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const db = await getDb();
  const [row] = await db.select({ file: s.orderDeliverables, order: s.orders }).from(s.orderDeliverables).innerJoin(s.orders, eq(s.orders.id, s.orderDeliverables.orderId)).where(eq(s.orderDeliverables.id, id));
  if (!row) return new Response("Not found", { status: 404 });
  const allowed = viewer.user.role === "admin" || row.order.sellerId === viewer.seller?.id || (row.order.buyerId === viewer.user.id && row.order.status === "paid" && row.order.fulfillmentStatus === "delivered");
  if (!allowed) return new Response("Not found", { status: 404 });
  return streamDownload(row.file.storageKey, row.file.filename, row.file.contentType);
}
