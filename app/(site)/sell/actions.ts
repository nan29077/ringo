"use server";
import { z } from "zod";
import { requireViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { CommerceError } from "@/lib/server/commerce";
import { applyAsSeller } from "@/lib/server/sellers";

const blankToUndefined = (fd: FormData, key: string) => {
  const v = String(fd.get(key) ?? "").trim();
  return v ? v : undefined;
};

export async function submitSellerApplication(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireViewer("/sell");
    const { t } = await getT();
    if (viewer.user.role === "admin") throw new CommerceError("forbidden");
    const db = await getDb();
    z.object({ applicationNote: z.string().trim().min(10).max(2000) }).parse({ applicationNote: String(fd.get("applicationNote") ?? "") });
    let website = blankToUndefined(fd, "website");
    if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
    const raw: Record<string, unknown> = {
      displayName: String(fd.get("displayName") ?? ""),
      slug: String(fd.get("slug") ?? ""),
      bio: blankToUndefined(fd, "bio"),
      website,
      applicationNote: String(fd.get("applicationNote") ?? ""),
    };
    // Payout details are optional when applying, but must be complete if any are entered.
    const payoutMethod = blankToUndefined(fd, "payoutMethod");
    const payoutAccountName = blankToUndefined(fd, "payoutAccountName");
    const payoutAccountNumber = blankToUndefined(fd, "payoutAccountNumber");
    if (payoutAccountName || payoutAccountNumber) {
      Object.assign(raw, { payoutMethod: payoutMethod ?? "bank", payoutBankName: blankToUndefined(fd, "payoutBankName"), payoutAccountName, payoutAccountNumber });
      z.object({ payoutAccountName: z.string().min(1), payoutAccountNumber: z.string().min(3) }).parse(raw);
    }
    const result = await applyAsSeller(db, viewer, raw);
    await audit(db, viewer, viewer.seller ? "seller.reapply" : "seller.apply", "user", viewer.user.id, { slug: raw.slug, result });
    return result === "active"
      ? { ok: true, message: t("Your store is approved. Welcome to the seller center!", "입점이 승인되었습니다. 판매자 센터에 오신 것을 환영합니다!"), redirect: "/seller" }
      : { ok: true, message: t("Application submitted. We'll email you after review.", "입점 신청이 접수되었습니다. 심사 후 이메일로 안내드립니다."), redirect: "/sell/status" };
  });
}
