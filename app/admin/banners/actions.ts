"use server";
import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import { requireAdmin, isSafeNext } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { CommerceError } from "@/lib/server/commerce";

const id = z.string().uuid();
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const optionalDate = z.string().optional().transform((v, ctx) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
    return z.NEVER;
  }
  return d;
});

const bannerInput = z
  .object({
    titleEn: z.string().trim().min(1).max(120),
    titleKo: z.string().trim().min(1).max(120),
    subtitleEn: opt(240),
    subtitleKo: opt(240),
    ctaEn: opt(40),
    ctaKo: opt(40),
    imageKey: z.string().trim().min(1).max(300).regex(/^(preset:banner-(books|course|design)|public\/banners\/[a-zA-Z0-9/_.-]+)$/, "Choose a preset or upload an image"),
    linkUrl: opt(500).refine((v) => !v || isSafeNext(v) || /^https:\/\/[^\s\\]+$/.test(v), "Must start with / or https://"),
    sort: z.coerce.number().int().min(0).max(100000),
    active: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
    startsAt: optionalDate,
    endsAt: optionalDate,
  })
  .superRefine((v, ctx) => {
    if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "Must be after the start" });
  });

const refresh = () => {
  revalidatePath("/admin/banners");
  revalidatePath("/", "layout");
};

export async function saveBanner(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const bannerId = fd.get("id") ? id.parse(String(fd.get("id"))) : undefined;
    const values = bannerInput.parse(Object.fromEntries(fd));
    if (bannerId) {
      const [existing] = await db.select().from(s.banners).where(eq(s.banners.id, bannerId));
      if (!existing) throw new CommerceError("not_found");
      await db.update(s.banners).set(values).where(eq(s.banners.id, bannerId));
      await audit(db, viewer, "banner.update", "banner", bannerId, { titleEn: values.titleEn, active: values.active, sort: values.sort, imageKey: values.imageKey, linkUrl: values.linkUrl });
      refresh();
      return { ok: true, message: t("Banner saved.", "배너를 저장했습니다.") };
    }
    const [row] = await db.insert(s.banners).values(values).returning();
    await audit(db, viewer, "banner.create", "banner", row.id, { titleEn: row.titleEn, active: row.active });
    refresh();
    return { ok: true, message: t("Banner created.", "배너를 등록했습니다."), redirect: "/admin/banners" };
  }, "ko");
}

export async function toggleBanner(bannerId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const [b] = await db.select().from(s.banners).where(eq(s.banners.id, id.parse(bannerId)));
    if (!b) throw new CommerceError("not_found");
    await db.update(s.banners).set({ active: !b.active }).where(eq(s.banners.id, b.id));
    await audit(db, viewer, "banner.toggle", "banner", b.id, { active: !b.active });
    refresh();
    return { ok: true, message: b.active ? t("Banner hidden.", "배너를 숨겼습니다.") : t("Banner shown.", "배너를 노출합니다.") };
  }, "ko");
}

/** Moves a banner one place up/down. Renumbers sort as 10, 20, 30… so the order is always explicit. */
export async function moveBanner(bannerId: string, dir: "up" | "down"): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const target = id.parse(bannerId);
    const direction = z.enum(["up", "down"]).parse(dir);
    const rows = await db.select({ id: s.banners.id, sort: s.banners.sort }).from(s.banners).orderBy(asc(s.banners.sort), asc(s.banners.createdAt));
    const i = rows.findIndex((r) => r.id === target);
    if (i < 0) throw new CommerceError("not_found");
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= rows.length) throw new CommerceError("invalid_state");
    [rows[i], rows[j]] = [rows[j], rows[i]];
    await db.transaction(async (tx) => {
      for (const [index, r] of rows.entries()) {
        const sort = (index + 1) * 10;
        if (r.sort !== sort) await tx.update(s.banners).set({ sort }).where(eq(s.banners.id, r.id));
      }
    });
    await audit(db, viewer, "banner.move", "banner", target, { direction, position: j + 1 });
    refresh();
    return { ok: true };
  }, "ko");
}

export async function deleteBanner(bannerId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const [b] = await db.select().from(s.banners).where(eq(s.banners.id, id.parse(bannerId)));
    if (!b) throw new CommerceError("not_found");
    await db.delete(s.banners).where(eq(s.banners.id, b.id));
    await audit(db, viewer, "banner.delete", "banner", b.id, { titleEn: b.titleEn, imageKey: b.imageKey });
    refresh();
    return { ok: true, message: t("Banner deleted.", "배너를 삭제했습니다."), redirect: "/admin/banners" };
  }, "ko");
}
