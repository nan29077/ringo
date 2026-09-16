"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { CommerceError } from "@/lib/server/commerce";

const id = z.string().uuid();
const bool = z.preprocess((v) => v === "on" || v === "true", z.boolean());
const noticeInput = z.object({
  audience: z.enum(["all", "sellers", "buyers"]),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(20000),
  pinned: bool,
  published: bool,
});

const refresh = () => {
  revalidatePath("/admin/notices");
  revalidatePath("/seller/notices");
};

export async function saveNotice(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const noticeId = fd.get("id") ? id.parse(String(fd.get("id"))) : undefined;
    const values = noticeInput.parse(Object.fromEntries(fd));
    if (noticeId) {
      const [existing] = await db.select().from(s.notices).where(eq(s.notices.id, noticeId));
      if (!existing) throw new CommerceError("not_found");
      await db.update(s.notices).set({ ...values, updatedAt: new Date() }).where(eq(s.notices.id, noticeId));
      await audit(db, viewer, "notice.update", "notice", noticeId, { title: values.title, audience: values.audience, pinned: values.pinned, published: values.published, bodyChanged: existing.body !== values.body });
      refresh();
      return { ok: true, message: t("Notice saved.", "공지사항을 저장했습니다.") };
    }
    const [row] = await db.insert(s.notices).values({ ...values, createdBy: viewer.user.id }).returning();
    await audit(db, viewer, "notice.create", "notice", row.id, { title: row.title, audience: row.audience, published: row.published });
    refresh();
    return { ok: true, message: t("Notice created.", "공지사항을 등록했습니다."), redirect: "/admin/notices" };
  }, "ko");
}

export async function toggleNoticeFlag(noticeId: string, flag: "pinned" | "published"): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const which = z.enum(["pinned", "published"]).parse(flag);
    const [n] = await db.select().from(s.notices).where(eq(s.notices.id, id.parse(noticeId)));
    if (!n) throw new CommerceError("not_found");
    const value = !n[which];
    await db.update(s.notices).set({ [which]: value, updatedAt: new Date() }).where(eq(s.notices.id, n.id));
    await audit(db, viewer, `notice.${which}`, "notice", n.id, { value });
    refresh();
    return { ok: true };
  }, "ko");
}

export async function deleteNotice(noticeId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const [n] = await db.select().from(s.notices).where(eq(s.notices.id, id.parse(noticeId)));
    if (!n) throw new CommerceError("not_found");
    await db.delete(s.notices).where(eq(s.notices.id, n.id));
    await audit(db, viewer, "notice.delete", "notice", n.id, { title: n.title, audience: n.audience });
    refresh();
    return { ok: true, message: t("Notice deleted.", "공지사항을 삭제했습니다."), redirect: "/admin/notices" };
  }, "ko");
}
