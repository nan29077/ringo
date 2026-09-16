"use server";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { CommerceError } from "@/lib/server/commerce";

const slug = z.string().trim().toLowerCase().min(2).max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const categoryInput = z.object({
  originalId: z.string().optional().transform((v) => v || undefined),
  id: z.string().optional(),
  nameEn: z.string().trim().min(1).max(60),
  nameKo: z.string().trim().min(1).max(60),
  deliveryType: z.enum(["download", "course", "service", "collection"]),
  sort: z.coerce.number().int().min(0).max(100000),
  active: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

async function productCount(db: Awaited<ReturnType<typeof getDb>>, id: string) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(s.products).where(eq(s.products.categoryId, id));
  return row.n;
}

export async function saveCategory(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const input = categoryInput.parse(Object.fromEntries(fd));
    const values = { nameEn: input.nameEn, nameKo: input.nameKo, deliveryType: input.deliveryType, sort: input.sort, active: input.active };
    if (input.originalId) {
      const [existing] = await db.select().from(s.categories).where(eq(s.categories.id, input.originalId));
      if (!existing) throw new CommerceError("not_found");
      // Products copy the delivery type; changing it under existing products would change how buyers receive them.
      if (existing.deliveryType !== values.deliveryType && (await productCount(db, existing.id)) > 0) throw new CommerceError("in_use");
      await db.update(s.categories).set(values).where(eq(s.categories.id, existing.id));
      await audit(db, viewer, "category.update", "category", existing.id, { before: { nameEn: existing.nameEn, nameKo: existing.nameKo, deliveryType: existing.deliveryType, sort: existing.sort, active: existing.active }, after: values });
      revalidatePath("/admin/categories");
      return { ok: true, message: t("Category saved.", "분류를 저장했습니다."), redirect: "/admin/categories" };
    }
    const id = slug.parse(input.id ?? "");
    const [row] = await db.insert(s.categories).values({ id, ...values }).onConflictDoNothing().returning();
    if (!row) throw new CommerceError("code_taken");
    await audit(db, viewer, "category.create", "category", id, values);
    revalidatePath("/admin/categories");
    return { ok: true, message: t("Category created.", "분류를 추가했습니다."), redirect: "/admin/categories" };
  }, "ko");
}

export async function toggleCategory(categoryId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const id = slug.parse(categoryId);
    const [c] = await db.select().from(s.categories).where(eq(s.categories.id, id));
    if (!c) throw new CommerceError("not_found");
    await db.update(s.categories).set({ active: !c.active }).where(eq(s.categories.id, id));
    await audit(db, viewer, "category.toggle", "category", id, { active: !c.active });
    return { ok: true, message: c.active ? t("Category deactivated. Existing products stay on sale.", "분류를 비활성화했습니다. 기존 상품은 계속 판매됩니다.") : t("Category activated.", "분류를 활성화했습니다.") };
  }, "ko");
}

export async function deleteCategory(categoryId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const id = slug.parse(categoryId);
    const [c] = await db.select().from(s.categories).where(eq(s.categories.id, id));
    if (!c) throw new CommerceError("not_found");
    if ((await productCount(db, id)) > 0) throw new CommerceError("in_use");
    await db.delete(s.categories).where(eq(s.categories.id, id));
    await audit(db, viewer, "category.delete", "category", id, { nameEn: c.nameEn, nameKo: c.nameKo });
    return { ok: true, message: t("Category deleted.", "분류를 삭제했습니다."), redirect: "/admin/categories" };
  }, "ko");
}
