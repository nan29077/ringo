"use server";
import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { CommerceError } from "@/lib/server/commerce";
import { parseZonedInput } from "@/lib/time";

const id = z.string().uuid();
const blank = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);
const majorToCents = z.coerce.number().min(0).max(100000).transform((v) => Math.round(v * 100));
const optionalDate = z.preprocess(blank, z.string().optional()).transform((v, ctx) => {
  if (!v) return null;
  const d = parseZonedInput(v);
  if (!d) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
    return z.NEVER;
  }
  return d;
});

// A past end date is only refused when it is being set now; an already-ended coupon can still be edited.
const minuteOf = (d: Date | null | undefined) => (d ? Math.floor(d.getTime() / 60000) : null);
function assertEndNotPast(endsAt: Date | null, before?: Date | null) {
  if (!endsAt || endsAt.getTime() >= Date.now()) return;
  if (before !== undefined && minuteOf(before) === minuteOf(endsAt)) return;
  throw new CommerceError("coupon_end_past");
}

const couponInput = z
  .object({
    code: z.string().trim().toUpperCase().min(3).max(40).regex(/^[A-Z0-9_-]+$/),
    name: z.string().trim().min(1).max(100),
    productId: z.preprocess(blank, z.string().uuid().optional()),
    kind: z.enum(["percent", "fixed"]),
    value: z.coerce.number().positive().max(100000),
    minOrder: z.preprocess(blank, majorToCents.optional()),
    maxDiscount: z.preprocess(blank, majorToCents.optional()),
    usageLimit: z.preprocess(blank, z.coerce.number().int().min(1).max(1000000).optional()),
    perUserLimit: z.preprocess(blank, z.coerce.number().int().min(1).max(100).default(1)),
    startsAt: optionalDate,
    endsAt: optionalDate,
    active: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "percent" && (!Number.isInteger(v.value) || v.value < 1 || v.value > 100)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "1–100" });
    if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "Must be after the start" });
  });

/** Create / edit a platform coupon (seller_id null). Seller coupons are managed by sellers; admins can only toggle them. */
export async function adminSaveCoupon(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const couponId = fd.get("id") ? id.parse(String(fd.get("id"))) : undefined;
    const input = couponInput.parse(Object.fromEntries(fd));
    if (input.productId) {
      const [p] = await db.select({ id: s.products.id }).from(s.products).where(eq(s.products.id, input.productId));
      if (!p) throw new CommerceError("not_found");
    }
    const taken = await db.select({ id: s.coupons.id }).from(s.coupons).where(and(eq(s.coupons.code, input.code), couponId ? ne(s.coupons.id, couponId) : undefined));
    if (taken.length) throw new CommerceError("code_taken");

    const values = {
      code: input.code,
      name: input.name,
      productId: input.productId ?? null,
      kind: input.kind,
      value: input.kind === "percent" ? input.value : Math.round(input.value * 100),
      minOrderCents: input.minOrder ?? 0,
      maxDiscountCents: input.kind === "percent" ? input.maxDiscount ?? null : null,
      usageLimit: input.usageLimit ?? null,
      perUserLimit: input.perUserLimit,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      active: input.active,
    };

    if (couponId) {
      const [existing] = await db.select().from(s.coupons).where(and(eq(s.coupons.id, couponId), isNull(s.coupons.sellerId)));
      if (!existing) throw new CommerceError("not_found");
      assertEndNotPast(values.endsAt, existing.endsAt);
      if (existing.usedCount > 0 && (existing.kind !== values.kind || existing.value !== values.value || existing.code !== values.code)) throw new CommerceError("in_use");
      if (values.usageLimit != null && values.usageLimit < existing.usedCount) throw new CommerceError("invalid_state");
      await db.update(s.coupons).set(values).where(eq(s.coupons.id, couponId));
      await audit(db, viewer, "coupon.update", "coupon", couponId, { code: values.code, before: { value: existing.value, kind: existing.kind, active: existing.active, usageLimit: existing.usageLimit, endsAt: existing.endsAt }, after: { value: values.value, kind: values.kind, active: values.active, usageLimit: values.usageLimit, endsAt: values.endsAt } });
      return { ok: true, message: t("Coupon saved.", "쿠폰을 저장했습니다.") };
    }
    assertEndNotPast(values.endsAt);
    const [row] = await db.insert(s.coupons).values({ ...values, sellerId: null, createdBy: viewer.user.id }).onConflictDoNothing().returning();
    if (!row) throw new CommerceError("code_taken");
    await audit(db, viewer, "coupon.create", "coupon", row.id, { code: row.code, scope: "platform", kind: row.kind, value: row.value });
    return { ok: true, message: t("Platform coupon created.", "플랫폼 쿠폰을 만들었습니다."), redirect: `/admin/coupons/${row.id}` };
  }, "ko");
}

export async function adminToggleCoupon(couponId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const [c] = await db.select().from(s.coupons).where(eq(s.coupons.id, id.parse(couponId)));
    if (!c) throw new CommerceError("not_found");
    await db.update(s.coupons).set({ active: !c.active }).where(eq(s.coupons.id, c.id));
    await audit(db, viewer, "coupon.toggle", "coupon", c.id, { code: c.code, active: !c.active, scope: c.sellerId ? "seller" : "platform" });
    return { ok: true, message: c.active ? t("Coupon deactivated.", "쿠폰을 비활성화했습니다.") : t("Coupon activated.", "쿠폰을 활성화했습니다.") };
  }, "ko");
}
