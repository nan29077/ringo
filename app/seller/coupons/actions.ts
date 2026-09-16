"use server";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { CommerceError } from "@/lib/server/commerce";

const id = z.string().uuid();
const blank = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);
const majorToCents = z.coerce.number().min(0).max(100000).transform((v) => Math.round(v * 100));
const optionalDate = z.preprocess(blank, z.string().optional()).transform((v, ctx) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
    return z.NEVER;
  }
  return d;
});

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

export async function sellerSaveCoupon(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireSeller();
    const db = await getDb();
    const { t } = await getT("ko");
    const couponId = fd.get("id") ? id.parse(String(fd.get("id"))) : undefined;
    const input = couponInput.parse(Object.fromEntries(fd));
    const sellerId = viewer.seller.id;

    if (input.productId) {
      const [p] = await db.select({ id: s.products.id }).from(s.products).where(and(eq(s.products.id, input.productId), eq(s.products.sellerId, sellerId)));
      if (!p) throw new CommerceError("not_found");
    }
    const taken = await db.select({ id: s.coupons.id }).from(s.coupons).where(and(eq(s.coupons.code, input.code), couponId ? ne(s.coupons.id, couponId) : undefined));
    if (taken.length) throw new CommerceError("code_taken");

    const value = input.kind === "percent" ? input.value : Math.round(input.value * 100);
    const values = {
      code: input.code,
      name: input.name,
      productId: input.productId ?? null,
      kind: input.kind,
      value,
      minOrderCents: input.minOrder ?? 0,
      maxDiscountCents: input.kind === "percent" ? input.maxDiscount ?? null : null,
      usageLimit: input.usageLimit ?? null,
      perUserLimit: input.perUserLimit,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      active: input.active,
    };

    if (couponId) {
      const [existing] = await db.select().from(s.coupons).where(and(eq(s.coupons.id, couponId), eq(s.coupons.sellerId, sellerId)));
      if (!existing) throw new CommerceError("not_found");
      if (existing.usedCount > 0) {
        // Keep the discount terms stable once buyers have used the coupon.
        if (existing.kind !== values.kind || existing.value !== values.value || existing.code !== values.code) throw new CommerceError("in_use");
      }
      if (values.usageLimit != null && values.usageLimit < existing.usedCount) throw new CommerceError("invalid_state");
      await db.update(s.coupons).set(values).where(and(eq(s.coupons.id, couponId), eq(s.coupons.sellerId, sellerId)));
      await audit(db, viewer, "coupon.update", "coupon", couponId, { code: values.code });
      return { ok: true, message: t("Coupon saved.", "쿠폰을 저장했습니다.") };
    }
    const [row] = await db.insert(s.coupons).values({ ...values, sellerId, createdBy: viewer.user.id }).onConflictDoNothing().returning();
    if (!row) throw new CommerceError("code_taken");
    await audit(db, viewer, "coupon.create", "coupon", row.id, { code: row.code });
    return { ok: true, message: t("Coupon created.", "쿠폰을 만들었습니다."), redirect: "/seller/coupons" };
  }, "ko");
}

export async function sellerToggleCoupon(couponId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireSeller();
    const db = await getDb();
    const { t } = await getT("ko");
    const [c] = await db.select().from(s.coupons).where(and(eq(s.coupons.id, id.parse(couponId)), eq(s.coupons.sellerId, viewer.seller.id)));
    if (!c) throw new CommerceError("not_found");
    await db.update(s.coupons).set({ active: !c.active }).where(eq(s.coupons.id, c.id));
    await audit(db, viewer, "coupon.toggle", "coupon", c.id, { active: !c.active });
    return { ok: true, message: c.active ? t("Coupon deactivated.", "쿠폰을 비활성화했습니다.") : t("Coupon activated.", "쿠폰을 활성화했습니다.") };
  }, "ko");
}
