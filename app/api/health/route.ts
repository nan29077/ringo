import { sql } from "drizzle-orm";
import { getDb, databaseDriver } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** Load balancer / container health check. */
export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: databaseDriver() });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
