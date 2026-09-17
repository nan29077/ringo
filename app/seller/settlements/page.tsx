import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { listParams, type SP } from "@/lib/server/list";
import { holdReasons, sellerBalance } from "@/lib/server/seller-center";
import { formatDate, formatMoney } from "@/lib/i18n";
import { settlementStatus } from "@/lib/status";
import { PageHeader, Panel, StatCard, DataTable, EmptyState, Badge, Notice } from "@/components/console/ui";
import { isAdjustmentSettlement } from "@/lib/server/commerce";
import { Pagination } from "@/components/console/filters";
import { StatusBadge } from "@/components/console/status-badge";

export const metadata = { title: "Settlements" };

export default async function SellerSettlements({ searchParams }: { searchParams: Promise<SP> }) {
  const viewer = await requireSeller();
  const sp = await searchParams;
  const { page, size, offset } = listParams(sp, 10);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const cond = eq(s.settlements.sellerId, viewer.seller.id);
  const [balance, rows, [{ total }]] = await Promise.all([
    sellerBalance(db, viewer.seller.id),
    db.select().from(s.settlements).where(cond).orderBy(desc(s.settlements.createdAt)).limit(size).offset(offset),
    db.select({ total: count() }).from(s.settlements).where(cond),
  ]);
  const cur = balance.currency;
  const m = (c: number, currency = cur) => formatMoney(c, currency, lang);
  const payoutMissing = !viewer.seller.payoutMethod || !viewer.seller.payoutAccountNumber;
  const eligibleIds = new Set(balance.available.orders.map((o) => o.id));
  const allUnsettled = [...balance.available.orders, ...balance.holding.orders].sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0));
  const unsettled = allUnsettled.slice(0, 100);
  const reasonLabel = (r: string, releaseAt: Date | null) =>
    r === "refund_requested" ? t("Refund requested", "환불 요청 처리 전") : r === "not_delivered" ? t("Not delivered", "납품 전") : t(`Refund window · until ${formatDate(releaseAt, lang)}`, `환불 가능 기간 · ${formatDate(releaseAt, lang)}까지`);

  return (
    <>
      <PageHeader title={t("Settlements", "정산")} description={t(`Orders become payable ${balance.refundWindowDays} days after payment, once delivered and without an open refund request.`, `결제 후 ${balance.refundWindowDays}일이 지나고, 납품이 완료되었으며 환불 요청이 없는 주문이 정산 대상이 됩니다.`)} />
      {payoutMissing && (
        <div className="mb-4"><Notice tone="warn">{t("No payout account registered. Payouts cannot be sent until you add one.", "정산 계좌가 등록되지 않아 지급할 수 없습니다.")} <Link href="/seller/settings/payout" className="font-semibold underline">{t("Register payout account", "정산 계좌 등록")}</Link></Notice></div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Available for next payout", "다음 정산 가능 금액")} value={m(balance.available.cents)} hint={balance.adjustments.count ? t(`${balance.available.count} orders · ${m(balance.adjustments.cents)} refund deduction`, `주문 ${balance.available.count}건 · 환불 차감 ${m(balance.adjustments.cents)}`) : t(`${balance.available.count} orders`, `주문 ${balance.available.count}건`)} tone="good" />
        <StatCard label={t("Holding", "정산 보류")} value={m(balance.holding.cents)} hint={t(`${balance.holding.count} orders in refund window or production`, `환불 기간·제작 중 주문 ${balance.holding.count}건`)} tone="warn" />
        <StatCard label={t("Awaiting transfer", "지급 대기")} value={m(balance.awaitingTransfer.cents)} hint={t(`${balance.awaitingTransfer.n} settlements`, `정산서 ${balance.awaitingTransfer.n}건`)} />
        <StatCard label={t("Paid out total", "누적 지급액")} value={m(balance.paidOut.cents)} hint={t(`${balance.paidOut.n} payouts`, `지급 ${balance.paidOut.n}건`)} tone="info" />
      </div>

      <Panel className="mt-4" title={<>{t("Settlement history", "정산 내역")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
        <DataTable
          head={[t("Period", "정산 기간"), t("Orders", "주문 수"), t("Gross", "판매액"), t("Commission", "수수료"), t("Net payout", "지급액"), t("Status", "상태"), t("Reference", "송금 참조"), t("Paid", "지급일"), ""]}
          empty={<EmptyState title={t("No settlements yet", "정산 내역이 없습니다")} description={t("The marketplace team creates settlements from eligible orders.", "운영팀이 정산 가능한 주문으로 정산서를 생성합니다.")} />}
          footer={total > size ? <Pagination total={total} page={page} size={size} /> : undefined}
        >
          {rows.map((x) => (
            <tr key={x.id}>
              <td className="whitespace-nowrap">{isAdjustmentSettlement(x) ? <Badge tone="red">{t("Refund deduction", "환불 차감")}</Badge> : <>{formatDate(x.periodStart, lang)} ~ {formatDate(x.periodEnd, lang)}</>}<div className="text-[11px] text-[#8a8d96]">{t("Created", "생성")} {formatDate(x.createdAt, lang)}</div></td>
              <td>{x.orderCount}</td>
              <td className="whitespace-nowrap">{m(x.grossCents, x.currency)}</td>
              <td className="whitespace-nowrap text-[#6b6e78]">{m(-x.commissionCents, x.currency)}</td>
              <td className="whitespace-nowrap font-semibold">{m(x.netCents, x.currency)}</td>
              <td>{isAdjustmentSettlement(x) ? <Badge tone={x.status === "paid" ? "gray" : "amber"}>{x.status === "paid" ? t("Deducted", "차감 완료") : t("Deducted from next payout", "다음 정산에서 차감")}</Badge> : <StatusBadge map={settlementStatus} value={x.status} lang={lang} />}</td>
              <td className="max-w-[160px] truncate text-xs">{isAdjustmentSettlement(x) ? t("Applied to a payout", "정산에 반영됨") : x.reference ?? "—"}</td>
              <td className="whitespace-nowrap text-xs">{formatDate(x.paidAt, lang)}</td>
              <td className="text-right"><Link href={`/seller/settlements/${x.id}`} className="rc-btn rc-btn-outline rc-btn-sm">{t("Details", "상세")}</Link></td>
            </tr>
          ))}
        </DataTable>
      </Panel>

      <Panel className="mt-4" title={<>{t("Unsettled orders", "미정산 주문")} <span className="ml-1 text-[#8a8d96]">{allUnsettled.length}</span></>} description={allUnsettled.length > unsettled.length ? t("Latest 100 paid orders not yet included in a settlement. Export all orders from the order list.", "정산서에 포함되지 않은 최근 결제 주문 100건입니다. 전체 내역은 주문 목록에서 CSV로 받으세요.") : t("Paid orders not yet included in a settlement.", "아직 정산서에 포함되지 않은 결제 완료 주문입니다.")} bodyClass="p-0">
        <DataTable head={[t("Order", "주문번호"), t("Product", "상품"), t("Paid", "결제일"), t("Total", "결제금액"), t("Seller net", "정산예정액"), t("Status", "정산 상태")]} empty={<EmptyState title={t("No unsettled orders", "미정산 주문이 없습니다")} />}>
          {unsettled.map((o) => {
            const ok = eligibleIds.has(o.id);
            const h = holdReasons(o, balance.refundWindowDays);
            return (
              <tr key={o.id}>
                <td className="whitespace-nowrap"><Link href={`/seller/orders/${o.id}`} className="font-semibold text-[#2f4ac2] hover:underline">{o.orderNo}</Link></td>
                <td className="max-w-[240px] truncate">{o.productTitle}</td>
                <td className="whitespace-nowrap text-xs">{formatDate(o.paidAt, lang)}</td>
                <td className="whitespace-nowrap">{m(o.totalCents, o.currency)}</td>
                <td className="whitespace-nowrap font-medium">{m(o.sellerNetCents, o.currency)}</td>
                <td>{ok ? <Badge tone="green">{t("Next payout", "다음 정산 대상")}</Badge> : <div className="flex flex-wrap gap-1">{h.reasons.map((r) => <Badge key={r} tone={r === "refund_window" ? "gray" : "amber"}>{reasonLabel(r, h.releaseAt)}</Badge>)}</div>}</td>
              </tr>
            );
          })}
        </DataTable>
      </Panel>
    </>
  );
}
