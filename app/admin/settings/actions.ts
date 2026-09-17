"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sql } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { ActionError, run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { CommerceError } from "@/lib/server/commerce";
import { getSettings, saveSettingsSection, type SiteSettings } from "@/lib/server/settings";
import { providerStatus } from "@/lib/server/payments";

const bool = z.preprocess((v) => v === "on" || v === "true", z.boolean());

const siteInput = z.object({
  name: z.string().trim().min(1).max(60),
  supportEmail: z.string().trim().email().max(200),
  currency: z.enum(["USD", "PHP", "KRW"]),
  defaultLocale: z.enum(["en", "ko"]),
  businessInfo: z.string().trim().max(2000).default(""),
});
const commerceInput = z.object({
  commissionPercent: z.coerce.number().min(0).max(100),
  refundWindowDays: z.coerce.number().int().min(0).max(365),
  pendingPaymentMinutes: z.coerce.number().int().min(5).max(10080),
  minPayout: z.coerce.number().min(0).max(1000000),
});
const moderationInput = z.object({ autoApproveSellers: bool, autoApproveProducts: bool });

function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(after)) if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out[k] = { from: before[k], to: after[k] };
  return out;
}

export async function adminSaveSettings(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const section = z.enum(["site", "commerce", "moderation"]).parse(String(fd.get("section")));
    const raw = Object.fromEntries(fd);
    const current = await getSettings(db);
    let next: SiteSettings[typeof section];
    if (section === "site") {
      next = siteInput.parse(raw);
      if (next.currency !== current.site.currency) {
        // Ringo runs in a single currency: dashboards and settlements sum amounts as one currency, so it can only be
        // changed before any product or order exists in the previous one.
        const [{ products }] = await db.select({ products: sql<number>`count(*)::int` }).from(s.products);
        const [{ orders }] = await db.select({ orders: sql<number>`count(*)::int` }).from(s.orders);
        if (products > 0 || orders > 0) {
          throw new ActionError(t(`The currency cannot be changed once products or orders exist (${products} products, ${orders} orders in ${current.site.currency}).`, `상품이나 주문이 있으면 통화를 변경할 수 없습니다 (${current.site.currency} 기준 상품 ${products}개, 주문 ${orders}건).`));
        }
      }
    } else if (section === "commerce") {
      const v = commerceInput.parse(raw);
      next = { defaultCommissionBps: Math.round(v.commissionPercent * 100), refundWindowDays: v.refundWindowDays, pendingPaymentMinutes: v.pendingPaymentMinutes, minPayoutCents: Math.round(v.minPayout * 100) };
    } else next = moderationInput.parse(raw);
    const changes = diff(current[section] as Record<string, unknown>, next as Record<string, unknown>);
    if (!Object.keys(changes).length) return { ok: true, message: t("Nothing changed.", "변경된 내용이 없습니다.") };
    await saveSettingsSection(db, section, { ...current[section], ...next } as never, viewer.user.id);
    await audit(db, viewer, `settings.${section}`, "settings", section, changes);
    revalidatePath("/", "layout");
    return { ok: true, message: t("Settings saved.", "설정을 저장했습니다.") };
  }, "ko");
}

export async function adminSetProvider(providerId: string, enable: boolean): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const id = z.string().min(1).max(40).parse(providerId);
    const on = z.boolean().parse(enable);
    const status = providerStatus().find((p) => p.id === id);
    if (!status) throw new CommerceError("not_found");
    if (on && !status.available) throw new CommerceError("provider_unavailable");
    const current = await getSettings(db);
    const before = current.payments.enabledProviders;
    const enabledProviders = on ? Array.from(new Set([...before, id])) : before.filter((p) => p !== id);
    await saveSettingsSection(db, "payments", { ...current.payments, enabledProviders }, viewer.user.id);
    await audit(db, viewer, "settings.payments", "settings", "payments", { provider: id, enabled: on, before, after: enabledProviders });
    revalidatePath("/", "layout");
    return { ok: true, message: on ? t(`${status.label} enabled for checkout.`, `${status.label} 결제를 사용합니다.`) : t(`${status.label} disabled for checkout.`, `${status.label} 결제를 중지했습니다.`) };
  }, "ko");
}
