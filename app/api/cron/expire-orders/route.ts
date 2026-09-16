import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/server/db";
import { expireStaleOrders } from "@/lib/server/commerce";

export const dynamic = "force-dynamic";

/** Scheduled job (e.g. EventBridge Scheduler every 10 min): POST with header `authorization: Bearer $CRON_SECRET`. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const expired = await expireStaleOrders(await getDb());
  return Response.json({ ok: true, expired });
}
