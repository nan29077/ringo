import "server-only";
import type { DB } from "./db";
import { logError } from "./audit";
import { sendTemplateMail } from "./mail";
import type { MailTemplateName, MailVars } from "./mail-templates";
import type { Lang } from "../i18n";

/**
 * Sends a transactional email as a side effect of an action that has ALREADY been committed.
 *
 * Notifications are never the point of an action: the refund happened, the reply was stored, the
 * payout went out. If the mail step throws — SMTP is down, the outbox insert fails — the action must
 * still report success, because the caller sees a generic "something went wrong" toast otherwise and
 * retries, producing a duplicate reply or a second refund attempt against an order that is already
 * refunded. The failure is recorded in the error log instead, where an operator can find it.
 *
 * Use `sendTemplateMail` directly only where delivery is the action itself (e.g. a verification
 * link the user is waiting for), so the caller can surface a real failure.
 */
export async function notify<K extends MailTemplateName>(db: DB, to: string, template: K, lang: Lang, vars: MailVars<K>) {
  try {
    await sendTemplateMail(db, to, template, lang, vars);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await logError(db, "notify", message, { to, template });
    } catch {
      console.error(`[ringo:notify] ${template} → ${to} failed and could not be logged: ${message}`);
    }
    return false;
  }
}
