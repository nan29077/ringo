import Link from "next/link";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { formatDate } from "@/lib/i18n";
import { sellerStatus } from "@/lib/status";
import { PageHeader, Panel, DataTable, EmptyState, Notice, DetailList, Badge } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionButton, ActionForm } from "@/components/common/action-form";
import { approveSeller, rejectSeller } from "../actions";

export const metadata = { title: "Seller applications" };

export default async function AdminSellerApplications() {
  await requireAdmin();
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const reviewer = alias(s.users, "reviewer");
  const [pending, recent, settings] = await Promise.all([
    db.select({ seller: s.sellers, user: s.users }).from(s.sellers).innerJoin(s.users, eq(s.users.id, s.sellers.userId)).where(eq(s.sellers.status, "pending")).orderBy(asc(s.sellers.updatedAt)),
    db
      .select({ seller: s.sellers, user: s.users, reviewerEmail: reviewer.email })
      .from(s.sellers)
      .innerJoin(s.users, eq(s.users.id, s.sellers.userId))
      .leftJoin(reviewer, eq(reviewer.id, s.sellers.reviewedBy))
      .where(and(isNotNull(s.sellers.reviewedAt), inArray(s.sellers.status, ["active", "rejected", "suspended"])))
      .orderBy(desc(s.sellers.reviewedAt))
      .limit(20),
    getSettings(db),
  ]);
  const payoutLabel = (x: typeof s.sellers.$inferSelect) => (x.payoutMethod ? `${x.payoutMethod.toUpperCase()}${x.payoutBankName ? ` · ${x.payoutBankName}` : ""} · ${x.payoutAccountName ?? ""} · ${x.payoutAccountNumber ?? ""}` : null);

  return (
    <>
      <PageHeader title={t("Seller applications", "입점 신청")} description={t("Review store applications. Approved applicants get the seller role and access to the seller center.", "입점 신청서를 검토하세요. 승인하면 판매자 권한과 판매자 센터 이용 권한이 부여됩니다.")} />
      {settings.moderation.autoApproveSellers && <div className="mb-4"><Notice tone="warn">{t("Auto-approval of sellers is ON in settings — new applications are approved without review.", "기본 설정에서 판매자 자동 승인이 켜져 있어 신규 신청은 심사 없이 승인됩니다.")}</Notice></div>}

      <Panel className="mb-4" title={<>{t("Pending applications", "심사 대기")} <span className="ml-1 text-[#ed4b2e]">{pending.length}</span></>} bodyClass={pending.length ? "p-0" : ""}>
        {pending.length === 0 ? (
          <EmptyState title={t("No pending applications", "심사 대기 중인 신청이 없습니다")} />
        ) : (
          <div className="divide-y divide-[#eef0f3]">
            {pending.map(({ seller: x, user }) => (
              <div key={x.id} className="grid gap-5 p-5 lg:grid-cols-[1fr_360px]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold">{x.displayName}</h3>
                    <code className="rounded bg-[#f3f4f7] px-1.5 py-0.5 text-xs">/s/{x.slug}</code>
                    <StatusBadge map={sellerStatus} value={x.status} lang={lang} />
                    {x.rejectReason && <Badge tone="amber">{t("Re-application", "재신청")}</Badge>}
                  </div>
                  <div className="mt-3">
                    <DetailList
                      items={[
                        [t("Applicant", "신청자"), <Link key="u" href={`/admin/members/${user.id}`} className="text-[#2f4ac2] hover:underline">{user.name} · {user.email}</Link>],
                        [t("Applied", "신청일"), formatDate(x.updatedAt, lang, true)],
                        [t("Website", "웹사이트"), x.website && /^https?:\/\//i.test(x.website) ? <a key="w" href={x.website} target="_blank" rel="noopener noreferrer nofollow" className="text-[#2f4ac2] hover:underline">{x.website}</a> : x.website ?? "—"],
                        [t("Payout details", "정산 계좌"), payoutLabel(x) ?? <span key="p" className="text-[#a45c00]">{t("Not provided", "미입력")}</span>],
                        [t("Bio", "소개"), x.bio ?? "—"],
                        ...(x.rejectReason ? [[t("Previous rejection", "이전 반려 사유"), x.rejectReason] as [string, string]] : []),
                      ]}
                    />
                  </div>
                  <h4 className="mt-4 text-xs font-semibold text-[#6b6e78]">{t("Application note", "신청 내용")}</h4>
                  <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-[#f8f9fb] px-4 py-3 text-sm leading-relaxed">{x.applicationNote ?? "—"}</p>
                </div>
                <div className="grid content-start gap-3">
                  <ActionButton variant="default" className="w-full" action={approveSeller.bind(null, x.id)} confirm={t(`Approve "${x.displayName}" as a seller?`, `"${x.displayName}" 스토어의 입점을 승인할까요?`)}>{t("Approve store", "입점 승인")}</ActionButton>
                  <ActionForm action={rejectSeller} className="grid gap-2 rounded-lg border border-[#eef0f3] p-3" confirm={t("Reject this application? The applicant is emailed the reason.", "입점 신청을 반려할까요? 신청자에게 사유가 메일로 전달됩니다.")}>
                    <input type="hidden" name="sellerId" value={x.id} />
                    <label className="grid gap-1.5 text-sm"><span className="font-medium">{t("Rejection reason", "반려 사유")}<span className="text-[#e5484d]">*</span></span><textarea name="reason" required maxLength={2000} className="rc-textarea !min-h-[72px]" placeholder={t("Shown to the applicant", "신청자에게 전달됩니다")} /></label>
                    <button className="rc-btn rc-btn-danger rc-btn-sm justify-self-start">{t("Reject", "반려")}</button>
                  </ActionForm>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title={t("Recently reviewed", "최근 심사 내역")} bodyClass="p-0">
        <DataTable head={[t("Store", "스토어"), t("Applicant", "신청자"), t("Result", "결과"), t("Reason", "반려 사유"), t("Reviewed", "심사일"), t("Reviewer", "심사자")]} empty={<EmptyState title={t("No reviews yet", "심사 내역이 없습니다")} />}>
          {recent.map(({ seller: x, user, reviewerEmail }) => (
            <tr key={x.id}>
              <td>{x.status === "rejected" ? <span className="font-semibold">{x.displayName}</span> : <Link href={`/admin/sellers/${x.id}`} className="font-semibold hover:underline">{x.displayName}</Link>}<div className="text-[11px] text-[#8a8d96]">/s/{x.slug}</div></td>
              <td className="text-xs"><Link href={`/admin/members/${user.id}`} className="hover:underline">{user.email}</Link></td>
              <td><StatusBadge map={sellerStatus} value={x.status} lang={lang} /></td>
              <td className="max-w-[260px] text-xs text-[#5b5e68]">{x.status === "rejected" ? x.rejectReason ?? "—" : "—"}</td>
              <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(x.reviewedAt, lang, true)}</td>
              <td className="text-xs">{reviewerEmail ?? (x.reviewedBy ? "—" : t("Auto / seed", "자동"))}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
