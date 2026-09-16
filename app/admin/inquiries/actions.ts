"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { CommerceError } from "@/lib/server/commerce";
import { closeInquiry, getInquiryThread, replyInquiry } from "@/lib/server/inquiries";

const id = z.string().uuid();

export async function adminReplyInquiry(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const inquiryId = id.parse(String(fd.get("inquiryId")));
    const body = z.string().trim().min(1).max(5000).parse(String(fd.get("body") ?? ""));
    const { inquiry } = await getInquiryThread(db, viewer, inquiryId);
    await replyInquiry(db, viewer, inquiryId, body);
    await audit(db, viewer, "inquiry.reply", "inquiry", inquiryId, { from: inquiry.status, routedTo: inquiry.sellerId ? "seller" : "platform", length: body.length });
    revalidatePath("/admin", "layout");
    return { ok: true, message: t("Reply sent. The customer was notified by email.", "답변을 등록하고 고객에게 이메일로 알렸습니다.") };
  }, "ko");
}

export async function adminCloseInquiry(inquiryId: string): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireAdmin();
    const db = await getDb();
    const { t } = await getT("ko");
    const target = id.parse(inquiryId);
    const { inquiry } = await getInquiryThread(db, viewer, target);
    if (inquiry.status === "closed") throw new CommerceError("invalid_state");
    await closeInquiry(db, viewer, target);
    await audit(db, viewer, "inquiry.close", "inquiry", target, { from: inquiry.status });
    revalidatePath("/admin", "layout");
    return { ok: true, message: t("Inquiry closed.", "문의를 종료했습니다.") };
  }, "ko");
}
