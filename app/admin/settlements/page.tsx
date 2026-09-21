import Link from "next/link";
import { count, desc, eq, inArray, not, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { listParams, type SP } from "@/lib/server/list";
import { enumOpts, payoutOverview, settlementWhere } from "@/lib/server/admin-ops";
import { adjustmentSettlementWhere, isAdjustmentSettlement } from "@/lib/server/commerce";
import { zonedDateKey } from "@/lib/time";
import { formatDate, formatMoney } from "@/lib/i18n";
import { sellerStatus, settlementStatus } from "@/lib/status";
import { PageHeader, Panel, DataTable, EmptyState, Badge, Notice, StatCard } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionButton, ActionForm } from "@/components/common/action-form";
import { cancelPayoutBatch, createPayoutBatch, markPayoutPaid } from "./actions";

export const metadata = { title: "Seller payouts" };

export default async function AdminSettlements({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { page, size, offset } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const cond = settlementWhere(sp);
  const [overview, sellerRows, rows, [{ total }], totals] = await Promise.all([
    payoutOverview(db),
    db.select({ id: s.sellers.id, name: s.sellers.displayName }).from(s.sellers).where(inArray(s.sellers.status, ["active", "suspended"])).orderBy(s.sellers.displayName),
    db.select({ st: s.settlements, seller: s.sellers.displayName }).from(s.settlements).innerJoin(s.sellers, eq(s.sellers.id, s.settlements.sellerId)).where(cond).orderBy(desc(s.settlements.createdAt)).limit(size).offset(offset),
    db.select({ total: count() }).from(s.settlements).innerJoin(s.sellers, eq(s.sellers.id, s.settlements.sellerId)).where(cond),
    // Refund deductions are negative rows that ride along with a batch; counting them as payouts would
    // understate "누적 지급액" and inflate the settlement counts, so they are excluded here.
    db.select({ status: s.settlements.status, n: sql<number>`count(*)::int`, cents: sql<number>`coalesce(sum(${s.settlements.netCents}),0)::int` }).from(s.settlements).where(not(adjustmentSettlementWhere)).groupBy(s.settlements.status),
  ]);
  const { settings } = overview;
  const cur = settings.site.currency;
  const m = (c: number, currency = cur) => formatMoney(c, currency, lang);
  const sum = (k: "availableCents" | "holdingCents") => overview.rows.reduce((a, r) => a + r[k], 0);
  const byStatus = (k: string) => totals.find((x) => x.status === k) ?? { n: 0, cents: 0 };
  const today = zonedDateKey();

  return (
    <>
      <PageHeader title={t("Seller payouts", "판매자 정산")} description={t(`Create payout batches from eligible orders (paid ${settings.commerce.refundWindowDays}+ days ago, delivered, no open refund request), transfer the money, then record the transfer reference.`, `정산 가능한 주문(결제 후 ${settings.commerce.refundWindowDays}일 경과·납품 완료·환불 요청 없음)으로 정산서를 만들고, 송금 후 송금 참조번호를 기록하세요.`)} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Available now", "지금 정산 가능")} value={m(sum("availableCents"))} hint={t(`${overview.rows.filter((r) => r.availableN).length} sellers`, `판매자 ${overview.rows.filter((r) => r.availableN).length}명`)} tone="good" />
        <StatCard label={t("Holding", "정산 보류")} value={m(sum("holdingCents"))} hint={t("Refund window, production or refund request", "환불 기간·제작 중·환불 요청")} tone="warn" />
        <StatCard label={t("Awaiting transfer", "지급 대기")} value={m(byStatus("pending").cents)} hint={t(`${byStatus("pending").n} settlements`, `정산서 ${byStatus("pending").n}건`)} />
        <StatCard label={t("Paid out total", "누적 지급액")} value={m(byStatus("paid").cents)} hint={t(`${byStatus("paid").n} payouts`, `지급 ${byStatus("paid").n}건`)} tone="info" />
      </div>

      <Panel className="mb-4" title={t("Payout queue by seller", "판매자별 정산 대기")} description={t("Sellers with unsettled paid orders. Batches always include every eligible order up to the cut-off date.", "미정산 결제 주문이 있는 판매자입니다. 정산서에는 기준일까지의 정산 가능 주문이 모두 포함됩니다.")} bodyClass="p-0">
        <DataTable
          head={[t("Seller", "판매자"), t("Available now", "정산 가능"), t("Holding", "보류"), t("Payout account", "정산 계좌"), t("Last payout", "최근 지급"), t("Create payout batch", "정산서 생성")]}
          empty={<EmptyState title={t("No unsettled orders", "미정산 주문이 없습니다")} />}
        >
          {overview.rows.map((r) => {
            const x = r.seller!;
            const noAccount = !x.payoutMethod || !x.payoutAccountNumber;
            const belowMin = r.availableCents < settings.commerce.minPayoutCents;
            return (
              <tr key={r.sellerId}>
                <td><Link href={`/admin/sellers/${x.id}`} className="font-semibold hover:underline">{x.displayName}</Link>{x.status !== "active" && <span className="ml-1.5"><StatusBadge map={sellerStatus} value={x.status} lang={lang} /></span>}<div className="text-[11px] text-[#8a8d96]">{r.email}</div></td>
                <td className="whitespace-nowrap"><b className={r.availableN ? "text-[#16794a]" : "text-[#b3b5bc]"}>{m(r.availableCents, r.currency)}</b><div className="text-[11px] text-[#8a8d96]">{t(`${r.availableN} orders`, `${r.availableN}건`)}{r.adjustmentN > 0 && <span className="ml-1 text-[#b42318]">{t(`· ${m(r.adjustmentCents, r.currency)} refund deduction`, `· 환불 차감 ${m(r.adjustmentCents, r.currency)}`)}</span>}</div></td>
                <td className="whitespace-nowrap">{m(r.holdingCents, r.currency)}<div className="text-[11px] text-[#8a8d96]">{t(`${r.holdingN} orders`, `${r.holdingN}건`)}</div></td>
                <td className="text-xs">{noAccount ? <Badge tone="red">{t("Not registered", "미등록")}</Badge> : <span>{x.payoutMethod?.toUpperCase()} · {x.payoutAccountName}</span>}</td>
                <td className="whitespace-nowrap text-xs">{formatDate(r.lastPaidAt, lang)}{r.pendingSettlements > 0 && <div><Badge tone="amber">{t(`${r.pendingSettlements} awaiting transfer`, `지급 대기 ${r.pendingSettlements}건`)}</Badge></div>}</td>
                <td>
                  {r.availableN > 0 && r.availableCents > 0 && !belowMin ? (
                    <details>
                      <summary className="rc-btn rc-btn-primary rc-btn-sm cursor-pointer list-none">{t("Create batch", "정산서 생성")}</summary>
                      <ActionForm action={createPayoutBatch} className="mt-2 grid w-64 gap-2" confirm={t(`Create a payout batch for ${x.displayName}?`, `${x.displayName}의 정산서를 생성할까요?`)}>
                        <input type="hidden" name="sellerId" value={x.id} />
                        <label className="grid gap-1 text-xs text-[#6b6e78]">{t("Cut-off date (optional, inclusive)", "기준일 (선택, 해당일 포함)")}<input type="date" name="until" max={today} className="rc-date w-full" /></label>
                        <input name="memo" maxLength={500} className="rc-input" placeholder={t("Memo (optional)", "메모 (선택)")} />
                        {noAccount && <p className="text-[11px] text-[#a45c00]">{t("No payout account registered.", "정산 계좌가 없습니다.")}</p>}
                        <button className="rc-btn rc-btn-primary rc-btn-sm justify-self-end">{t("Create", "생성")}</button>
                      </ActionForm>
                    </details>
                  ) : r.availableN > 0 && r.availableCents > 0 ? (
                    // Creating the batch would be refused; the balance rolls over until it reaches the minimum.
                    <span className="text-xs text-[#a45c00]">{t(`Below the minimum payout (${m(settings.commerce.minPayoutCents)})`, `최소 지급액(${m(settings.commerce.minPayoutCents)}) 미만`)}</span>
                  ) : r.availableN > 0 ? (
                    // Eligible orders exist but refund deductions swallow them, so a batch would only fail.
                    <span className="text-xs text-[#b42318]">{t("Refund deductions exceed the payout", "환불 차감액이 정산 금액보다 큼")}</span>
                  ) : <span className="text-xs text-[#b3b5bc]">{t("Nothing eligible yet", "정산 가능 주문 없음")}</span>}
                </td>
              </tr>
            );
          })}
        </DataTable>
      </Panel>

      <FilterBar
        exportHref="/admin/settlements/export"
        fields={[
          { type: "search", name: "q", placeholder: ["Seller, reference or memo", "판매자, 송금 참조, 메모"] },
          { type: "select", name: "status", label: ["Status", "상태"], options: enumOpts(settlementStatus) },
          { type: "select", name: "seller", label: ["Seller", "판매자"], options: sellerRows.map((x) => ({ value: x.id, en: x.name, ko: x.name })) },
          { type: "period" },
        ]}
      />
      {byStatus("pending").n > 0 && <div className="mb-4"><Notice tone="warn">{t("Mark a settlement as paid only after the bank / e-wallet transfer has completed.", "은행·전자지갑 송금이 완료된 뒤에 지급 완료로 처리하세요.")}</Notice></div>}
      <Panel title={<>{t("Settlements", "정산서")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
        <DataTable
          head={[t("Created", "생성일"), t("Seller", "판매자"), t("Period", "정산 기간"), t("Orders", "주문"), t("Gross", "판매액"), t("Commission", "수수료"), t("Net payout", "지급액"), t("Status", "상태"), t("Reference", "송금 참조"), ""]}
          empty={<EmptyState title={t("No settlements match these filters.", "조건에 맞는 정산서가 없습니다.")} />}
          footer={<Pagination total={total} page={page} size={size} />}
        >
          {rows.map(({ st, seller }) => (
            <tr key={st.id}>
              <td className="whitespace-nowrap text-xs"><Link href={`/admin/settlements/${st.id}`} className="font-semibold text-[#2f4ac2] hover:underline">{formatDate(st.createdAt, lang, true)}</Link>{isAdjustmentSettlement(st) && <div><Badge tone="red">{t("Refund deduction", "환불 차감")}</Badge></div>}</td>
              <td><Link href={`/admin/sellers/${st.sellerId}`} className="hover:underline">{seller}</Link></td>
              <td className="whitespace-nowrap text-xs">{formatDate(st.periodStart, lang)} ~ {formatDate(st.periodEnd, lang)}</td>
              <td>{st.orderCount}</td>
              <td className="whitespace-nowrap">{m(st.grossCents, st.currency)}</td>
              <td className="whitespace-nowrap text-[#6b6e78]">{m(-st.commissionCents, st.currency)}</td>
              <td className="whitespace-nowrap font-semibold">{m(st.netCents, st.currency)}</td>
              <td>{isAdjustmentSettlement(st) ? <Badge tone={st.status === "paid" ? "gray" : "amber"}>{st.status === "paid" ? t("Deducted", "차감 완료") : t("Deducted from next payout", "다음 정산에서 차감")}</Badge> : <><StatusBadge map={settlementStatus} value={st.status} lang={lang} />{st.paidAt && <div className="text-[11px] text-[#8a8d96]">{formatDate(st.paidAt, lang)}</div>}</>}</td>
              <td className="max-w-[160px] truncate text-xs">{isAdjustmentSettlement(st) ? (st.status === "paid" ? t("Applied to a payout", "정산에 반영됨") : "—") : st.reference ?? "—"}</td>
              <td className="text-right">
                {st.status === "pending" && isAdjustmentSettlement(st) ? (
                  <div className="flex items-start justify-end gap-1">
                    <span className="self-center text-[11px] text-[#8a8d96]">{t("Deducted from next payout", "다음 정산서에서 차감")}</span>
                    <ActionButton action={cancelPayoutBatch.bind(null, st.id)} confirm={t("Cancel this deduction? The refunded amount will no longer be deducted from the next payout.", "이 차감을 취소할까요? 환불 금액이 다음 정산에서 차감되지 않습니다.")}>{t("Cancel", "취소")}</ActionButton>
                  </div>
                ) : st.status === "pending" ? (
                  <div className="flex items-start justify-end gap-1">
                    <details className="text-left">
                      <summary className="rc-btn rc-btn-primary rc-btn-sm cursor-pointer list-none">{t("Mark paid", "지급 완료")}</summary>
                      <ActionForm action={markPayoutPaid} className="mt-2 grid w-60 gap-2" confirm={t(`Mark ${m(st.netCents, st.currency)} as transferred to ${seller}?`, `${seller}에게 ${m(st.netCents, st.currency)} 송금을 완료로 처리할까요?`)}>
                        <input type="hidden" name="settlementId" value={st.id} />
                        <input name="reference" required maxLength={200} className="rc-input" placeholder={t("Transfer reference (required)", "송금 참조번호 (필수)")} />
                        <button className="rc-btn rc-btn-primary rc-btn-sm justify-self-end">{t("Confirm", "확인")}</button>
                      </ActionForm>
                    </details>
                    <ActionButton action={cancelPayoutBatch.bind(null, st.id)} confirm={t("Cancel this settlement? Its orders return to the unsettled pool.", "이 정산서를 취소할까요? 포함된 주문은 미정산 상태로 돌아갑니다.")}>{t("Cancel", "취소")}</ActionButton>
                  </div>
                ) : (
                  <Link href={`/admin/settlements/${st.id}`} className="rc-btn rc-btn-outline rc-btn-sm">{t("Details", "상세")}</Link>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
