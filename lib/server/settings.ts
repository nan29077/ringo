import "server-only";
import { eq } from "drizzle-orm";
import { settings } from "@/db/schema";
import type { DB } from "./db";

export type SiteSettings = {
  site: { name: string; supportEmail: string; currency: string; defaultLocale: "en" | "ko"; businessInfo: string };
  commerce: { defaultCommissionBps: number; refundWindowDays: number; pendingPaymentMinutes: number; minPayoutCents: number };
  moderation: { autoApproveSellers: boolean; autoApproveProducts: boolean };
  payments: { testMode: boolean; enabledProviders: string[] };
};

export const defaultSettings: SiteSettings = {
  site: { name: "Ringo", supportEmail: "support@ringo.example", currency: "USD", defaultLocale: "en", businessInfo: "" },
  commerce: { defaultCommissionBps: 1000, refundWindowDays: 14, pendingPaymentMinutes: 60, minPayoutCents: 0 },
  moderation: { autoApproveSellers: false, autoApproveProducts: false },
  payments: { testMode: process.env.NODE_ENV !== "production", enabledProviders: ["test"] },
};

export async function getSettings(db: DB): Promise<SiteSettings> {
  const rows = await db.select().from(settings);
  const merged = structuredClone(defaultSettings) as Record<string, Record<string, unknown>>;
  for (const row of rows) {
    if (row.key in merged && row.value && typeof row.value === "object") {
      merged[row.key] = { ...merged[row.key], ...(row.value as Record<string, unknown>) };
    }
  }
  return merged as unknown as SiteSettings;
}

export async function saveSettingsSection<K extends keyof SiteSettings>(db: DB, key: K, value: SiteSettings[K], userId?: string) {
  const existing = await db.select().from(settings).where(eq(settings.key, key));
  if (existing.length) {
    await db.update(settings).set({ value, updatedBy: userId, updatedAt: new Date() }).where(eq(settings.key, key));
  } else {
    await db.insert(settings).values({ key, value, updatedBy: userId });
  }
}
