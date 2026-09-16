"use server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { CommerceError } from "@/lib/server/commerce";
import { toggleLink } from "@/lib/server/links";

export async function adminToggleLink(linkId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const id = z.string().uuid().parse(linkId);
    const [link] = await db.select().from(s.deepLinks).where(eq(s.deepLinks.id, id));
    if (!link) throw new CommerceError("not_found");
    await toggleLink(db, viewer, id);
    const next = link.status === "active" ? "paused" : "active";
    await audit(db, viewer, "link.toggle", "deep_link", id, { code: link.code, sellerId: link.sellerId, status: next });
    return { ok: true, message: next === "paused" ? t("Link paused. Visitors land on the product page without attribution.", "링크를 일시중지했습니다. 방문자는 추적 없이 상품 페이지로 이동합니다.") : t("Link resumed.", "링크를 재개했습니다.") };
  }, "ko");
}
