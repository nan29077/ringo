"use server";
import { z } from "zod";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { CommerceError } from "@/lib/server/commerce";
import { closeInquiry, getInquiryThread, replyInquiry } from "@/lib/server/inquiries";

const id = z.string().uuid();

/** Loads the thread and makes sure it belongs to this seller's store (not platform support or a purchase the seller made). */
async function ownThread(inquiryId: string) {
  const viewer = await requireSeller();
  const db = await getDb();
  const thread = await getInquiryThread(db, viewer, id.parse(inquiryId));
  if (thread.inquiry.sellerId !== viewer.seller.id || thread.access !== "seller") throw new CommerceError("not_found");
  return { viewer, db, thread };
}

export async function sellerReplyInquiry(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const { viewer, db, thread } = await ownThread(String(fd.get("inquiryId")));
    const { t } = await getT("ko");
    const body = z.string().trim().min(1).max(5000).parse(String(fd.get("body") ?? ""));
    await replyInquiry(db, viewer, thread.inquiry.id, body);
    await audit(db, viewer, "inquiry.reply", "inquiry", thread.inquiry.id);
    return { ok: true, message: t("Reply sent. The customer was notified by email.", "답변을 등록하고 고객에게 이메일로 알렸습니다.") };
  }, "ko");
}

export async function sellerCloseInquiry(inquiryId: string): Promise<ActionResult> {
  return run(async () => {
    const { viewer, db, thread } = await ownThread(inquiryId);
    const { t } = await getT("ko");
    if (thread.inquiry.status === "closed") throw new CommerceError("invalid_state");
    await closeInquiry(db, viewer, thread.inquiry.id);
    await audit(db, viewer, "inquiry.close", "inquiry", thread.inquiry.id);
    return { ok: true, message: t("Inquiry closed.", "문의를 종료했습니다.") };
  }, "ko");
}
