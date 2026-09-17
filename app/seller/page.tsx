import Link from "next/link";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { dailySales, daysAgo, salesSummary } from "@/lib/server/analytics";
import { sellerBalance, sellerCounts } from "@/lib/server/seller-center";
import { mediaUrl } from "@/lib/server/storage";
import { formatDate, formatMoney } from "@/lib/i18n";
import { startOfZonedDay } from "@/lib/time";
import { fulfillmentStatus, orderStatus, refundStatus } from "@/lib/status";
import { PageHeader, Panel, StatCard, DataTable, EmptyState, Notice, Badge } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";
import { SalesChart } from "@/components/console/sales-chart";

export const metadata = { title: "Dashboard" };

export default async function SellerDashboard() {
  const viewer = await requireSeller();
  const sellerId = viewer.seller.id;
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const today = startOfZonedDay();

  const [month, todaySum, series, balance, counts, recent, top, notices] = await Promise.all([
    salesSummary(db, daysAgo(30), sellerId),
    salesSummary(db, today, sellerId),
    dailySales(db, 30, sellerId),
    sellerBalance(db, sellerId),
    sellerCounts(db, sellerId),
    db.select().from(s.orders).where(eq(s.orders.sellerId, sellerId)).orderBy(desc(s.orders.createdAt)).limit(8),
    db
      .select({ id: s.products.id, titleEn: s.products.titleEn, titleKo: s.products.titleKo, cover: s.products.coverKey, cents: sql<number>`coalesce(sum(${s.orders.totalCents}),0)::int`, orders: sql<number>`count(${s.orders.id})::int` })
      .from(s.orders)
      .innerJoin(s.products, eq(s.products.id, s.orders.productId))
      .where(and(eq(s.orders.sellerId, sellerId), eq(s.orders.status, "paid"), gte(s.orders.paidAt, daysAgo(30))))
      .groupBy(s.products.id)
      .orderBy(sql`coalesce(sum(${s.orders.totalCents}),0) desc`)
      .limit(5),
    db.select().from(s.notices).where(and(eq(s.notices.published, true), inArray(s.notices.audience, ["all", "sellers"]))).orderBy(desc(s.notices.pinned), desc(s.notices.createdAt)).limit(4),
  ]);
  const cur = balance.currency;
  const topMax = Math.max(1, ...top.map((x) => x.cents));
  const payoutMissing = !viewer.seller.payoutMethod || !viewer.seller.payoutAccountNumber;

  const todos = [
    { label: t("Service orders to produce", "제작해야 할 주문"), value: counts.pendingService, href: "/seller/orders/production" },
    { label: t("Overdue service orders", "납기 지난 제작 주문"), value: counts.overdueService, href: "/seller/orders/production" },
    { label: t("Refund requests", "환불 요청"), value: counts.refundRequests, href: "/seller/orders/refunds" },
    { label: t("Open customer inquiries", "답변 대기 문의"), value: counts.openInquiries, href: "/seller/inquiries?status=open" },
    { label: t("Rejected products", "반려된 상품"), value: counts.rejectedProducts, href: "/seller/products?status=rejected" },
    { label: t("Products in review", "심사 중인 상품"), value: counts.inReview, href: "/seller/products?status=pending_review" },
  ];

  return (
    <>
      <PageHeader
        title={t(`${viewer.seller.displayName} dashboard`, `${viewer.seller.displayName} 대시보드`)}
        description={t("Sales, balance and work that needs your attention.", "매출, 정산 잔액, 처리할 업무를 한눈에 확인하세요.")}
        actions={<><Link href={`/s/${viewer.seller.slug}`} target="_blank" className="rc-btn rc-btn-outline">{t("My store", "내 스토어")}</Link><Link href="/seller/products/new" className="rc-btn rc-btn-brand">{t("Add product", "상품 등록")}</Link></>}
      />
      {payoutMissing && (
        <div className="mb-4">
          <Notice tone="warn">
            {t("Register a payout account so settlements can be transferred to you.", "정산금을 받으려면 정산 계좌를 등록하세요.")}{" "}
            <Link href="/seller/settings/payout" className="font-semibold underline">{t("Register now", "지금 등록")}</Link>
          </Notice>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Sales · last 30 days", "최근 30일 매출")} value={formatMoney(month.gross, cur, lang)} hint={t(`${month.orders} paid orders · refunds ${formatMoney(month.refundCents, cur, lang)}`, `결제 ${month.orders}건 · 환불 ${formatMoney(month.refundCents, cur, lang)}`)} />
        <StatCard label={t("Seller net · 30 days", "판매자 순매출 · 30일")} value={formatMoney(month.netAfterRefunds, cur, lang)} hint={t("After commission and refunds", "수수료·환불 반영")} tone="good" />
        <StatCard
          label={t("Unsettled balance", "미정산 잔액")}
          value={formatMoney(balance.unsettledCents, cur, lang)}
          hint={t(`Next payout ${formatMoney(balance.available.cents, cur, lang)} · holding ${formatMoney(balance.holding.cents, cur, lang)}`, `다음 정산 가능 ${formatMoney(balance.available.cents, cur, lang)} · 보류 ${formatMoney(balance.holding.cents, cur, lang)}`)}
          tone="info"
          href="/seller/settlements"
        />
        <StatCard label={t("Orders today", "오늘 주문")} value={todaySum.orders.toLocaleString()} hint={t(`Sales ${formatMoney(todaySum.gross, cur, lang)}`, `매출 ${formatMoney(todaySum.gross, cur, lang)}`)} href="/seller/orders?period=today" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_320px]">
        <Panel title={t("Sales trend · 30 days", "매출 추이 · 최근 30일")} description={t("Paid orders by day", "결제 완료 기준 일별 매출")}>
          <SalesChart data={series} currency={cur} color="#ed4b2e" />
        </Panel>
        <Panel title={t("Needs attention", "처리할 업무")} bodyClass="p-2">
          {todos.map((x) => (
            <Link key={x.label} href={x.href} className="flex items-center justify-between rounded-lg px-3 py-3 text-sm hover:bg-[#f6f7f9]">
              <span className="text-[#3b3d46]">{x.label}</span>
              <span className="flex items-center gap-2">
                <b className={x.value ? "text-[#ed4b2e]" : "text-[#b3b5bc]"}>{x.value}</b>
                <ArrowRight className="size-4 text-[#b3b5bc]" />
              </span>
            </Link>
          ))}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_420px]">
        <Panel title={t("Recent orders", "최근 주문")} bodyClass="p-0" actions={<Link className="rc-btn rc-btn-outline rc-btn-sm" href="/seller/orders">{t("All orders", "전체 주문")}</Link>}>
          <DataTable head={[t("Order", "주문번호"), t("Buyer", "구매자"), t("Product", "상품"), t("Amount", "금액"), t("Status", "상태")]} empty={<EmptyState title={t("No orders yet", "아직 주문이 없습니다")} />}>
            {recent.map((o) => (
              <tr key={o.id}>
                <td className="whitespace-nowrap"><Link href={`/seller/orders/${o.id}`} className="font-semibold text-[#2f4ac2] hover:underline">{o.orderNo}</Link><div className="text-[11px] text-[#8a8d96]">{formatDate(o.createdAt, lang, true)}</div></td>
                <td>{o.buyerName}</td>
                <td className="max-w-[220px] truncate">{o.productTitle}</td>
                <td className="font-medium">{formatMoney(o.totalCents, o.currency, lang)}</td>
                <td className="space-x-1">
                  <StatusBadge map={orderStatus} value={o.status} lang={lang} />
                  {o.status === "paid" && o.fulfillmentStatus !== "not_required" && <StatusBadge map={fulfillmentStatus} value={o.fulfillmentStatus} lang={lang} />}
                  {o.refundStatus === "requested" && <StatusBadge map={refundStatus} value="requested" lang={lang} />}
                </td>
              </tr>
            ))}
          </DataTable>
        </Panel>
        <div className="grid content-start gap-4">
          <Panel title={t("Top products · 30 days", "인기 상품 · 30일")}>
            {top.length ? (
              <div className="grid gap-4">
                {top.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className="w-5 text-xs font-bold text-[#b3b5bc]">{String(i + 1).padStart(2, "0")}</span>
                    <img src={mediaUrl(p.cover)} alt="" className="rc-thumb !size-10" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/seller/products/${p.id}`} className="block truncate text-sm font-medium hover:underline">{lang === "ko" ? p.titleKo : p.titleEn}</Link>
                      <div className="mt-1.5 h-1.5 rounded-full bg-[#f0f1f4]"><div className="h-1.5 rounded-full bg-[#ed4b2e]" style={{ width: `${(p.cents / topMax) * 100}%` }} /></div>
                      <div className="mt-1 text-[11px] text-[#8a8d96]">{t(`${p.orders} orders`, `${p.orders}건`)}</div>
                    </div>
                    <b className="text-sm">{formatMoney(p.cents, cur, lang)}</b>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title={t("No sales in the last 30 days", "최근 30일 판매가 없습니다")} />
            )}
          </Panel>
          <Panel title={t("Notices", "공지사항")} bodyClass="p-2" actions={<Link className="rc-btn rc-btn-outline rc-btn-sm" href="/seller/notices">{t("All", "전체")}</Link>}>
            {notices.length ? notices.map((n) => (
              <Link key={n.id} href={`/seller/notices#${n.id}`} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm hover:bg-[#f6f7f9]">
                {n.pinned && <Badge tone="red">{t("Pinned", "중요")}</Badge>}
                <span className="min-w-0 flex-1 truncate">{n.title}</span>
                <span className="text-[11px] text-[#8a8d96]">{formatDate(n.createdAt, lang)}</span>
              </Link>
            )) : <EmptyState title={t("No notices", "공지사항이 없습니다")} />}
          </Panel>
        </div>
      </div>
    </>
  );
}
