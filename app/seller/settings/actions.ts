"use server";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { ActionError, run, type ActionResult } from "@/lib/server/action";
import { audit } from "@/lib/server/audit";
import { getT } from "@/lib/server/i18n-server";
import { updatePayout, updateSellerProfile } from "@/lib/server/sellers";

export async function sellerUpdateProfile(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireSeller();
    const db = await getDb();
    const { t } = await getT("ko");
    const raw = Object.fromEntries(fd) as Record<string, unknown>;
    const website = String(raw.website ?? "").trim();
    if (website && !/^https?:\/\//i.test(website)) raw.website = `https://${website}`;
    const avatar = String(raw.avatarKey ?? "");
    if (avatar && !avatar.startsWith("public/avatars/")) raw.avatarKey = viewer.seller.avatarKey ?? "";
    await updateSellerProfile(db, viewer.seller.id, raw);
    await audit(db, viewer, "seller.profile_update", "seller", viewer.seller.id, { slug: raw.slug });
    return { ok: true, message: t("Store profile saved.", "스토어 프로필을 저장했습니다.") };
  }, "ko");
}

export async function sellerUpdatePayout(fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const viewer = await requireSeller();
    const db = await getDb();
    const { t } = await getT("ko");
    if (fd.get("payoutMethod") === "bank" && !String(fd.get("payoutBankName") ?? "").trim()) throw new ActionError(t("Enter the bank name for bank transfers.", "은행 송금은 은행명을 입력하세요."));
    await updatePayout(db, viewer.seller.id, Object.fromEntries(fd));
    await audit(db, viewer, "seller.payout_update", "seller", viewer.seller.id, { method: fd.get("payoutMethod") });
    return { ok: true, message: t("Payout account saved.", "정산 계좌를 저장했습니다.") };
  }, "ko");
}
