import Link from "next/link";
import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { dailySales, daysAgo, salesSummary } from "@/lib/server/analytics";
import { formatDate, formatMoney } from "@/lib/i18n";
import { startOfZonedDay } from "@/lib/time";
import { orderStatus, refundStatus } from "@/lib/status";
import { PageHeader, Panel, StatCard, DataTable, EmptyState } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";
import { SalesChart } from "@/components/console/sales-chart";
import { mediaUrl } from "@/lib/server/storage";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  await requireAdmin(); // the layout checks too, but a page must not rely on its layout alone
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const settings = await getSettings(db);
  const cur = settings.site.currency;
  const today = startOfZonedDay();
  const n = async (q: Promise<{ v: number }[]>) => (await q)[0]?.v ?? 0;

  const [todaySum, monthSum, series, recent, top, members7, membersTotal, pendingProducts, pendingSellers, refundReq, overdue, openInq, pendingPayment, sellerCount] = await Promise.all([
    salesSummary(db, today),
    salesSummary(db, daysAgo(30)),
    dailySales(db, 30),
    db.select().from(s.orders).orderBy(desc(s.orders.createdAt)).limit(8),
    db
      .select({ id: s.products.id, title: lang === "ko" ? s.products.titleKo : s.products.titleEn, cover: s.products.coverKey, seller: s.sellers.displayName, cents: sql<number>`coalesce(sum(${s.orders.totalCents}),0)::int`, orders: sql<number>`count(${s.orders.id})::int` })
      .from(s.orders)
      .innerJoin(s.products, eq(s.products.id, s.orders.productId))
      .innerJoin(s.sellers, eq(s.sellers.id, s.orders.sellerId))
      .where(and(eq(s.orders.status, "paid"), gte(s.orders.paidAt, daysAgo(30))))
      .groupBy(s.products.id, s.sellers.displayName)
      .orderBy(sql`sum(${s.orders.totalCents}) desc`)
      .limit(5),
    n(db.select({ v: count() }).from(s.users).where(gte(s.users.createdAt, daysAgo(7)))),
    n(db.select({ v: count() }).from(s.users)),
    n(db.select({ v: count() }).from(s.products).where(eq(s.products.status, "pending_review"))),
    n(db.select({ v: count() }).from(s.sellers).where(eq(s.sellers.status, "pending"))),
    n(db.select({ v: count() }).from(s.orders).where(eq(s.orders.refundStatus, "requested"))),
    n(db.select({ v: count() }).from(s.orders).where(and(eq(s.orders.status, "paid"), sql`${s.orders.fulfillmentStatus} in ('pending','in_progress')`, lt(s.orders.dueAt, new Date())))),
    n(db.select({ v: count() }).from(s.inquiries).where(eq(s.inquiries.status, "open"))),
    n(db.select({ v: count() }).from(s.orders).where(eq(s.orders.status, "pending_payment"))),
    n(db.select({ v: count() }).from(s.sellers).where(eq(s.sellers.status, "active"))),
  ]);
  const topMax = Math.max(1, ...top.map((x) => x.cents));

  const todos = [
    { label: t("Products awaiting review", "심사 대기 상품"), value: pendingProducts, href: "/admin/products/review" },
    { label: t("Seller applications", "입점 신청"), value: pendingSellers, href: "/admin/sellers/applications" },
    { label: t("Refund requests", "환불 요청"), value: refundReq, href: "/admin/orders/refunds" },
    { label: t("Overdue service orders", "납기 지난 제작 주문"), value: overdue, href: "/admin/orders/fulfillment" },
    { label: t("Open inquiries", "답변 대기 문의"), value: openInq, href: "/admin/inquiries" },
  ];

  return (
    <>
      <PageHeader title={t("Marketplace dashboard", "쇼핑몰 관리 대시보드")} description={t("Sales, operations queue and recent activity at a glance.", "매출, 처리 대기 업무, 최근 활동을 한눈에 확인하세요.")} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Today's sales", "오늘 매출")} value={formatMoney(todaySum.gross, cur, lang)} hint={t(`${todaySum.orders} paid orders`, `결제 ${todaySum.orders}건`)} />
        <StatCard label={t("Sales · last 30 days", "최근 30일 매출")} value={formatMoney(monthSum.gross, cur, lang)} hint={t(`Refunds ${formatMoney(monthSum.refundCents, cur, lang)} · ${monthSum.orders} orders`, `환불 ${formatMoney(monthSum.refundCents, cur, lang)} · 주문 ${monthSum.orders}건`)} />
        <StatCard label={t("Platform commission · 30 days", "플랫폼 수수료 · 30일")} value={formatMoney(monthSum.commissionAfterRefunds, cur, lang)} hint={t("After refunds", "환불 반영")} tone="good" />
        <StatCard label={t("Members", "전체 회원")} value={membersTotal.toLocaleString()} hint={t(`+${members7} this week · ${sellerCount} active sellers`, `이번 주 +${members7} · 운영 판매자 ${sellerCount}`)} href="/admin/members" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_320px]">
        <Panel title={t("Sales trend · 30 days", "매출 추이 · 최근 30일")} description={t("Paid orders by day (report time zone)", "결제 완료 기준 일별 매출")} actions={<Link className="rc-btn rc-btn-outline rc-btn-sm" href="/admin/analytics">{t("Details", "상세 통계")}</Link>}>
          <SalesChart data={series} currency={cur} />
        </Panel>
        <Panel title={t("Needs attention", "처리 대기 업무")} bodyClass="p-2">
          {todos.map((x) => (
            <Link key={x.href} href={x.href} className="flex items-center justify-between rounded-lg px-3 py-3 text-sm hover:bg-[#f6f7f9]">
              <span className="text-[#3b3d46]">{x.label}</span>
              <span className="flex items-center gap-2">
                <b className={x.value ? "text-[#ed4b2e]" : "text-[#b3b5bc]"}>{x.value}</b>
                <ArrowRight className="size-4 text-[#b3b5bc]" />
              </span>
            </Link>
          ))}
          <p className="px-3 pb-2 pt-1 text-xs text-[#8a8d96]">{t(`${pendingPayment} orders awaiting payment`, `결제 대기 주문 ${pendingPayment}건`)}</p>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_420px]">
        <Panel title={t("Recent orders", "최근 주문")} bodyClass="p-0" actions={<Link className="rc-btn rc-btn-outline rc-btn-sm" href="/admin/orders">{t("All orders", "전체 주문")}</Link>}>
          <DataTable head={[t("Order", "주문번호"), t("Buyer", "고객명"), t("Product", "상품"), t("Amount", "금액"), t("Status", "상태")]} empty={<EmptyState title={t("No orders yet", "최근 주문이 없습니다")} />}>
            {recent.map((o) => (
              <tr key={o.id}>
                <td><Link href={`/admin/orders/${o.id}`} className="font-semibold text-[#2f4ac2] hover:underline">{o.orderNo}</Link><div className="text-[11px] text-[#8a8d96]">{formatDate(o.createdAt, lang, true)}</div></td>
                <td>{o.buyerName}</td>
                <td className="max-w-[220px] truncate">{o.productTitle}</td>
                <td className="font-medium">{formatMoney(o.totalCents, o.currency, lang)}</td>
                <td className="space-x-1"><StatusBadge map={orderStatus} value={o.status} lang={lang} />{o.refundStatus === "requested" && <StatusBadge map={refundStatus} value="requested" lang={lang} />}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title={t("Top products · 30 days", "인기 상품 · 30일")}>
          {top.length ? (
            <div className="grid gap-4">
              {top.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3">
                  <span className="w-5 text-xs font-bold text-[#b3b5bc]">{String(i + 1).padStart(2, "0")}</span>
                  <img src={mediaUrl(p.cover)} alt="" className="rc-thumb !size-10" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/products/${p.id}`} className="block truncate text-sm font-medium hover:underline">{p.title}</Link>
                    <div className="mt-1.5 h-1.5 rounded-full bg-[#f0f1f4]"><div className="h-1.5 rounded-full bg-[#3b5bdb]" style={{ width: `${(p.cents / topMax) * 100}%` }} /></div>
                    <div className="mt-1 text-[11px] text-[#8a8d96]">{p.seller} · {t(`${p.orders} orders`, `${p.orders}건`)}</div>
                  </div>
                  <b className="text-sm">{formatMoney(p.cents, cur, lang)}</b>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title={t("No sales data yet", "데이터가 없습니다")} />
          )}
        </Panel>
      </div>
    </>
  );
}
