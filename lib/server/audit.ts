import "server-only";
import { auditLogs, errorLogs } from "@/db/schema";
import type { DB } from "./db";
import type { Viewer } from "./auth";
import { requestMeta } from "./request";

export async function audit(db: DB, viewer: Viewer | null, action: string, targetType?: string, targetId?: string, data?: unknown) {
  let ip: string | null = null;
  try { ip = (await requestMeta()).ip; } catch {}
  await db.insert(auditLogs).values({
    actorId: viewer?.user.id,
    actorEmail: viewer?.user.email,
    actorRole: viewer?.user.role,
    action,
    targetType,
    targetId,
    data: data === undefined ? null : (data as object),
    ip,
  });
}

export async function logError(db: DB, source: string, message: string, data?: unknown) {
  try {
    await db.insert(errorLogs).values({ source, message: message.slice(0, 4000), data: data === undefined ? null : (data as object) });
  } catch (err) {
    console.error("[ringo] failed to write error log", err);
  }
}
