import "server-only";
import { mailOutbox } from "@/db/schema";
import type { DB } from "./db";
import { logError } from "./audit";

type Transport = { sendMail(opts: { from: string; to: string; subject: string; text: string }): Promise<unknown> };
let transport: Transport | null | undefined;

async function getTransport(): Promise<Transport | null> {
  if (transport !== undefined) return transport;
  if (!process.env.SMTP_HOST) return (transport = null);
  const nodemailer = await import("nodemailer");
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

/** Sends an email via SMTP (e.g. Amazon SES SMTP) or records it in the outbox when SMTP is not configured. */
export async function sendMail(db: DB, to: string, subject: string, text: string, template?: string) {
  const t = await getTransport();
  if (!t) {
    await db.insert(mailOutbox).values({ to, subject, bodyText: text, template, status: "logged" });
    if (process.env.NODE_ENV !== "production") console.info(`[ringo:mail] to=${to} subject=${subject}\n${text}`);
    return;
  }
  try {
    await t.sendMail({ from: process.env.MAIL_FROM || "Ringo <no-reply@ringo.example>", to, subject, text });
    await db.insert(mailOutbox).values({ to, subject, bodyText: text, template, status: "sent" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.insert(mailOutbox).values({ to, subject, bodyText: text, template, status: "failed", error: message });
    await logError(db, "mail", message, { to, subject });
  }
}
