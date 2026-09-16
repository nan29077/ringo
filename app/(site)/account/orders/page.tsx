import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { Receipt } from "lucide-react";
import * as s from "@/db/schema";
import { requireViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { mediaUrl } from "@/lib/server/storage";
import { listParams, one, type SP } from "@/lib/server/list";
import { formatDate, formatMoney } from "@/lib/i18n";
import { fulfillmentStatus, orderStatus, refundStatus } from "@/lib/status";
import { StatusBadge } from "@/components/console/status-badge";
import { AccountHeader, Empty, Pager } from "@/components/store/account-ui";

export const metadata = { title: "Orders" };

const FILTERS = ["pending_payment", "paid", "refunded", "cancelled", "expired"] as const;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const viewer = await requireViewer("/account/orders");
  const sp = await searchParams;
  const { t, lang } = await getT();
  const db = await getDb();
  const { page } = listParams(sp);
  const size = 10;
  const statusParam = one(sp, "status");
  const status = (FILTERS as readonly string[]).includes(statusParam) ? (statusParam as s.OrderStatus) : null;
  const where = and(eq(s.orders.buyerId, viewer.user.id), status ? eq(s.orders.status, status) : undefined);
  const [rows, [{ total }]] = await Promise.all([
    db.select({ order: s.orders, coverKey: s.products.coverKey }).from(s.orders).innerJoin(s.products, eq(s.products.id, s.orders.productId)).where(where).orderBy(desc(s.orders.createdAt)).limit(size).offset((page - 1) * size),
    db.select({ total: count() }).from(s.orders).where(where),
  ]);
  const pages = Math.max(1, Math.ceil(total / size));
  const tabs: [string | null, string][] = [[null, t("All", "전체")], ["paid", t("Paid", "결제 완료")], ["pending_payment", t("Awaiting payment", "결제 대기")], ["refunded", t("Refunded", "환불")], ["cancelled", t("Cancelled", "취소")]];

  return (
    <>
      <AccountHeader title={t("Orders", "주문 내역")} description={t("Receipts, payment status, refunds and service deliveries.", "영수증, 결제 상태, 환불, 제작 서비스 납품을 확인하세요.")} />
      <nav className="sf-tabs" aria-label={t("Filter by status", "상태별 보기")}>
        {tabs.map(([v, l]) => <Link key={v ?? "all"} href={v ? `/account/orders?status=${v}` : "/account/orders"} className={status === v ? "active" : ""} aria-current={status === v ? "true" : undefined}>{l}</Link>)}
      </nav>
      <div className="sf-card">
        {rows.length ? (
          <ul className="sf-list">
            {rows.map(({ order: o, coverKey }) => (
              <li key={o.id} className="sf-row">
                <img src={mediaUrl(coverKey)} alt="" className="sf-thumb" />
                <div className="min-w-0 flex-1">
                  <Link href={`/account/orders/${o.id}`} className="block font-semibold text-[#20211f] hover:underline">{o.productTitle}</Link>
                  <p className="text-[13px] text-[#6b7065]">{o.orderNo} · {formatDate(o.createdAt, lang, true)}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <StatusBadge map={orderStatus} value={o.status} lang={lang} />
                    {o.status === "paid" && o.fulfillmentStatus !== "not_required" && <StatusBadge map={fulfillmentStatus} value={o.fulfillmentStatus} lang={lang} />}
                    {o.refundStatus !== "none" && <StatusBadge map={refundStatus} value={o.refundStatus} lang={lang} />}
                  </div>
                </div>
                <div className="grid justify-items-end gap-2">
                  <strong className="text-[15px]">{formatMoney(o.totalCents, o.currency, lang)}</strong>
                  {o.status === "pending_payment" ? <Link href={`/checkout/${o.id}`} className="sf-btn sf-btn-primary sf-btn-sm">{t("Complete payment", "결제하기")}</Link> : <Link href={`/account/orders/${o.id}`} className="sf-btn sf-btn-outline sf-btn-sm">{t("Details", "상세")}</Link>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={Receipt} title={status ? t("No orders with this status", "해당 상태의 주문이 없습니다") : t("No orders yet", "아직 주문이 없어요")} action={!status && <Link href="/#catalog" className="sf-btn sf-btn-primary sf-btn-sm">{t("Browse products", "상품 둘러보기")}</Link>} />
        )}
      </div>
      <Pager page={page} pages={pages} t={t} href={(p) => `/account/orders?${new URLSearchParams({ ...(status ? { status } : {}), page: String(p) })}`} />
    </>
  );
}
