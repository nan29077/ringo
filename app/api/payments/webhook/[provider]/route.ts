import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { getDb } from "@/lib/server/db";
import { getProvider } from "@/lib/server/payments";
import { confirmPayment, failPayment } from "@/lib/server/commerce";
import { logError } from "@/lib/server/audit";

export const runtime = "nodejs";

/** PG webhook endpoint: verify signature → dedupe by event id → apply payment result. */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: providerId } = await params;
  const provider = getProvider(providerId);
  if (!provider || provider.id === "test") return new Response("Unknown provider", { status: 404 });
  const db = await getDb();
  const raw = await request.text();
  let event;
  try {
    event = await provider.parseWebhook(request, raw);
  } catch (err) {
    await logError(db, `webhook:${providerId}`, err instanceof Error ? err.message : String(err), { body: raw.slice(0, 2000) });
    return new Response("Invalid webhook", { status: 400 });
  }
  if (!event.eventId) return new Response("Missing event id", { status: 400 });
  const inserted = await db.insert(s.paymentEvents).values({ provider: providerId, eventId: event.eventId, type: event.type, payload: event.raw as object }).onConflictDoNothing().returning();
  if (!inserted.length) return Response.json({ ok: true, duplicate: true });
  try {
    if (event.paymentId && /^[0-9a-f-]{36}$/.test(event.paymentId)) {
      if (event.status === "succeeded") await confirmPayment(db, event.paymentId, { providerRef: event.providerRef, raw: event.raw });
      else if (event.status === "failed" || event.status === "cancelled") await failPayment(db, event.paymentId, event.type, event.status);
    }
    await db.update(s.paymentEvents).set({ processedAt: new Date() }).where(eq(s.paymentEvents.id, inserted[0].id));
    return Response.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(s.paymentEvents).set({ error: message }).where(eq(s.paymentEvents.id, inserted[0].id));
    await logError(db, `webhook:${providerId}`, message, { eventId: event.eventId });
    return new Response("Processing error", { status: 500 });
  }
}
