import "server-only";
import { eq } from "drizzle-orm";
import { mailOutbox, users } from "@/db/schema";
import type { DB } from "./db";
import { logError } from "./audit";
import { mailTemplates, type MailTemplateName, type MailVars } from "./mail-templates";
import type { Lang } from "../i18n";

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

/**
 * Language of a recipient's transactional email. English is the default for everyone; Korean is used
 * when that account explicitly runs Ringo in Korean (operators, Korean-speaking sellers).
 */
export async function recipientLang(db: DB, recipient: { email?: string | null; userId?: string | null; locale?: Lang | null }): Promise<Lang> {
  if (recipient.locale) return recipient.locale;
  const where = recipient.userId ? eq(users.id, recipient.userId) : recipient.email ? eq(users.email, recipient.email) : null;
  if (!where) return "en";
  const [row] = await db.select({ locale: users.locale }).from(users).where(where);
  return row?.locale ?? "en";
}

/** Renders a localized template and sends it. `lang` comes from `recipientLang` at the call site. */
export async function sendTemplateMail<K extends MailTemplateName>(db: DB, to: string, template: K, lang: Lang, vars: MailVars<K>) {
  const render = mailTemplates[template] as (v: MailVars<K>, lang: Lang) => { subject: string; text: string };
  const { subject, text } = render(vars, lang);
  await sendMail(db, to, subject, text, template);
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
