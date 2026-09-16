import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { isUuid } from "@/lib/server/seller-center";
import { formatDate, formatMoney } from "@/lib/i18n";
import { settlementStatus } from "@/lib/status";
import { PageHeader, Panel, DataTable, EmptyState, DetailList, StatCard, Notice } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionButton, ActionForm } from "@/components/common/action-form";
import { cancelPayoutBatch, markPayoutPaid } from "../actions";

export const metadata = { title: "Settlement" };

export default async function AdminSettlementDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const [row] = await db.select({ st: s.settlements, x: s.sellers, creator: s.users.email }).from(s.settlements).innerJoin(s.sellers, eq(s.sellers.id, s.settlements.sellerId)).leftJoin(s.users, eq(s.users.id, s.settlements.createdBy)).where(eq(s.settlements.id, id));
  if (!row) notFound();
  const { st, x, creator } = row;
  const [orders, history] = await Promise.all([
    db.select().from(s.orders).where(eq(s.orders.settlementId, id)).orderBy(asc(s.orders.paidAt)),
    db.select().from(s.auditLogs).where(and(eq(s.auditLogs.targetType, "settlement"), eq(s.auditLogs.targetId, id))).orderBy(desc(s.auditLogs.createdAt)),
  ]);
  const m = (c: number) => formatMoney(c, st.currency, lang);
  const title = `${formatDate(st.periodStart, lang)} ~ ${formatDate(st.periodEnd, lang)}`;
  const noAccount = !x.payoutMethod || !x.payoutAccountNumber;
  const actionLabel: Record<string, string> = {
    "settlement.create": t("Created", "정산서 생성"),
    "settlement.paid": t("Marked paid", "지급 완료 처리"),
    "settlement.cancel": t("Cancelled", "정산서 취소"),
  };

  return (
    <>
      <PageHeader
        title={`${x.displayName} · ${t("Settlement", "정산서")}`}
        description={title}
        crumbs={[{ href: "/admin/settlements", label: t("Settlements", "정산 관리") }, { label: title }]}
        actions={
          <>
            <StatusBadge map={settlementStatus} value={st.status} lang={lang} />
            {st.status === "pending" && <ActionButton variant="outline" action={cancelPayoutBatch.bind(null, st.id)} confirm={t("Cancel this settlement? Its orders return to the unsettled pool.", "이 정산서를 취소할까요? 포함된 주문은 미정산 상태로 돌아갑니다.")}>{t("Cancel settlement", "정산서 취소")}</ActionButton>}
          </>
        }
      />
      {st.status === "cancelled" && <div className="mb-4"><Notice>{t("This settlement was cancelled. Its orders were released back to the unsettled pool.", "취소된 정산서입니다. 포함되었던 주문은 미정산 상태로 돌아갔습니다.")}</Notice></div>}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={t("Gross sales", "판매액")} value={m(st.grossCents)} hint={t(`${st.orderCount} orders`, `주문 ${st.orderCount}건`)} />
        <StatCard label={t("Commission", "수수료")} value={`-${m(st.commissionCents)}`} />
        <StatCard label={t("Net payout", "지급액")} value={m(st.netCents)} tone="good" />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="grid min-w-0 content-start gap-4">
          <Panel title={<>{t("Included orders", "포함된 주문")} <span className="ml-1 text-[#8a8d96]">{orders.length}</span></>} bodyClass="p-0">
            <DataTable head={[t("Order", "주문번호"), t("Buyer", "구매자"), t("Product", "상품"), t("Paid", "결제일"), t("Total", "결제금액"), t("Commission", "수수료"), t("Net", "정산액")]} empty={<EmptyState title={st.status === "cancelled" ? t("Orders were released when the settlement was cancelled.", "정산서 취소로 주문이 해제되었습니다.") : t("No orders", "주문이 없습니다")} />}>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="whitespace-nowrap"><Link href={`/admin/orders/${o.id}`} className="font-semibold text-[#2f4ac2] hover:underline">{o.orderNo}</Link></td>
                  <td className="text-xs">{o.buyerName}</td>
                  <td className="max-w-[240px] truncate">{o.productTitle}</td>
                  <td className="whitespace-nowrap text-xs">{formatDate(o.paidAt, lang)}</td>
                  <td className="whitespace-nowrap">{m(o.totalCents)}</td>
                  <td className="whitespace-nowrap text-[#6b6e78]">-{m(o.commissionCents)} <span className="text-[11px]">({(o.commissionBps / 100).toFixed(o.commissionBps % 100 ? 2 : 0)}%)</span></td>
                  <td className="whitespace-nowrap font-medium">{m(o.sellerNetCents)}</td>
                </tr>
              ))}
            </DataTable>
          </Panel>
          <Panel title={t("Status history", "처리 이력")}>
            <div className="rc-timeline">
              {history.map((h) => (
                <div key={h.id}>
                  <i className={h.action === "settlement.paid" ? "!bg-[#16a36a]" : h.action === "settlement.cancel" ? "!bg-[#e5484d]" : ""} />
                  <div>
                    <div className="text-sm">{actionLabel[h.action] ?? h.action}{h.action === "settlement.paid" && h.data && typeof h.data === "object" && "reference" in h.data ? ` · ${String((h.data as { reference: unknown }).reference)}` : ""}</div>
                    <div className="text-[11px] text-[#8a8d96]">{formatDate(h.createdAt, lang, true)} · {h.actorEmail ?? "—"}</div>
                  </div>
                </div>
              ))}
              {!history.some((h) => h.action === "settlement.create") && (
                <div><i /><div><div className="text-sm">{actionLabel["settlement.create"]}</div><div className="text-[11px] text-[#8a8d96]">{formatDate(st.createdAt, lang, true)} · {creator ?? "—"}</div></div></div>
              )}
            </div>
          </Panel>
        </div>
        <div className="grid min-w-0 content-start gap-4">
          {st.status === "pending" && (
            <Panel title={t("Record transfer", "송금 완료 처리")} className="!border-[#ffe2b3]">
              <ActionForm action={markPayoutPaid} className="grid gap-2" confirm={t(`Mark ${m(st.netCents)} as transferred to ${x.displayName}?`, `${x.displayName}에게 ${m(st.netCents)} 송금을 완료로 처리할까요?`)}>
                <input type="hidden" name="settlementId" value={st.id} />
                <label className="grid gap-1.5 text-sm"><span className="font-medium">{t("Transfer reference", "송금 참조번호")}<span className="text-[#e5484d]">*</span></span><input name="reference" required maxLength={200} className="rc-input" placeholder={t("e.g. bank transfer ID", "예: 은행 이체 번호")} /></label>
                {noAccount && <Notice tone="warn">{t("The seller has no payout account registered.", "판매자의 정산 계좌가 등록되지 않았습니다.")}</Notice>}
                <button className="rc-btn rc-btn-primary justify-self-start">{t("Mark as paid & notify seller", "지급 완료 · 판매자 알림")}</button>
              </ActionForm>
            </Panel>
          )}
          <Panel title={t("Payout", "지급 정보")}>
            <DetailList
              items={[
                [t("Seller", "판매자"), <Link key="s" href={`/admin/sellers/${x.id}`} className="text-[#2f4ac2] hover:underline">{x.displayName}</Link>],
                [t("Status", "상태"), <StatusBadge key="st" map={settlementStatus} value={st.status} lang={lang} />],
                [t("Created", "생성일"), `${formatDate(st.createdAt, lang, true)}${creator ? ` · ${creator}` : ""}`],
                [t("Paid at", "지급일"), formatDate(st.paidAt, lang, true)],
                [t("Reference", "송금 참조"), st.reference ?? "—"],
                [t("Memo", "메모"), st.memo ?? "—"],
              ]}
            />
          </Panel>
          <Panel title={t("Seller payout account", "판매자 정산 계좌")} description={t("Current account on file (may have changed since the batch was created).", "현재 등록된 계좌입니다 (정산서 생성 이후 변경되었을 수 있습니다).")}>
            {noAccount ? (
              <Notice tone="warn">{t("No payout account registered.", "정산 계좌가 등록되지 않았습니다.")}</Notice>
            ) : (
              <DetailList items={[[t("Method", "수단"), x.payoutMethod!.toUpperCase()], [t("Bank", "은행"), x.payoutBankName ?? "—"], [t("Account name", "예금주"), x.payoutAccountName ?? "—"], [t("Account number", "계좌번호"), <code key="n" className="text-xs">{x.payoutAccountNumber}</code>]]} />
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
