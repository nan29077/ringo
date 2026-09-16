import Link from "next/link";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { daysAgo } from "@/lib/server/analytics";
import { likeQ, listParams, one, periodWhere, type SP } from "@/lib/server/list";
import { enumOpts, pct, sellerOrderAgg, sellerProductAgg } from "@/lib/server/admin-ops";
import { formatDate, formatMoney } from "@/lib/i18n";
import { sellerStatus } from "@/lib/status";
import { PageHeader, Panel, DataTable, EmptyState, Badge } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";
import { StatusBadge } from "@/components/console/status-badge";

export const metadata = { title: "Sellers" };

export default async function AdminSellers({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { page, size, offset, q } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const settings = await getSettings(db);
  const cur = settings.site.currency;

  const where: (SQL | undefined)[] = [periodWhere(s.sellers.createdAt, sp)];
  if (q) where.push(or(ilike(s.sellers.displayName, likeQ(q)), ilike(s.sellers.slug, likeQ(q)), ilike(s.users.email, likeQ(q)), ilike(s.users.name, likeQ(q))));
  const st = one(sp, "status");
  if (Object.hasOwn(sellerStatus, st)) where.push(eq(s.sellers.status, st as s.SellerStatus));
  const cond = and(...where);
  const pa = sellerProductAgg(db);
  const sa = sellerOrderAgg(db, daysAgo(30));
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ x: s.sellers, email: s.users.email, ownerId: s.users.id, products: pa.total, published: pa.published, sales30: sa.sales30, orders30: sa.orders30, unsettled: sa.unsettled })
      .from(s.sellers)
      .innerJoin(s.users, eq(s.users.id, s.sellers.userId))
      .leftJoin(pa, eq(pa.sellerId, s.sellers.id))
      .leftJoin(sa, eq(sa.sellerId, s.sellers.id))
      .where(cond)
      .orderBy(desc(s.sellers.createdAt))
      .limit(size)
      .offset(offset),
    db.select({ total: count() }).from(s.sellers).innerJoin(s.users, eq(s.users.id, s.sellers.userId)).where(cond),
  ]);

  return (
    <>
      <PageHeader
        title={t("Seller list", "판매자 목록")}
        description={t("Stores on the marketplace with commission, catalog size, recent sales and unsettled balance.", "입점 스토어의 수수료, 상품 수, 최근 매출, 미정산 금액을 확인하세요.")}
        actions={<Link href="/admin/sellers/applications" className="rc-btn rc-btn-outline">{t("Applications", "입점 신청")}</Link>}
      />
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: ["Store name, address, owner name or email", "스토어명, 주소, 대표자 이름·이메일"] },
          { type: "select", name: "status", label: ["Status", "상태"], options: enumOpts(sellerStatus) },
          { type: "period" },
        ]}
      />
      <Panel title={<>{t("Sellers", "판매자")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
        <DataTable
          head={[t("Store", "스토어"), t("Owner", "대표 계정"), t("Status", "상태"), t("Commission", "수수료"), t("Products", "상품 (판매중/전체)"), t("Sales · 30d", "30일 매출"), t("Unsettled net", "미정산 금액"), t("Joined", "입점일")]}
          empty={<EmptyState title={t("No sellers match these filters.", "조건에 맞는 판매자가 없습니다.")} />}
          footer={<Pagination total={total} page={page} size={size} />}
        >
          {rows.map(({ x, email, ownerId, products, published, sales30, orders30, unsettled }) => (
            <tr key={x.id}>
              <td>
                {x.status === "pending" ? <Link href="/admin/sellers/applications" className="font-semibold hover:underline">{x.displayName}</Link> : <Link href={`/admin/sellers/${x.id}`} className="font-semibold hover:underline">{x.displayName}</Link>}
                <div className="text-[11px] text-[#8a8d96]">/s/{x.slug}</div>
              </td>
              <td className="text-xs"><Link href={`/admin/members/${ownerId}`} className="hover:underline">{email}</Link></td>
              <td><StatusBadge map={sellerStatus} value={x.status} lang={lang} /></td>
              <td className="whitespace-nowrap">{x.commissionBps != null ? <><b>{pct(x.commissionBps)}</b> <Badge tone="violet">{t("Custom", "개별")}</Badge></> : <span className="text-[#6b6e78]">{pct(settings.commerce.defaultCommissionBps)} <span className="text-[11px]">({t("default", "기본")})</span></span>}</td>
              <td className="whitespace-nowrap"><Link href={`/admin/products?seller=${x.id}`} className="hover:underline"><b>{published ?? 0}</b><span className="text-[#8a8d96]"> / {products ?? 0}</span></Link></td>
              <td className="whitespace-nowrap">{formatMoney(sales30 ?? 0, cur, lang)}<div className="text-[11px] text-[#8a8d96]">{t(`${orders30 ?? 0} orders`, `${orders30 ?? 0}건`)}</div></td>
              <td className="whitespace-nowrap font-medium">{unsettled ? formatMoney(unsettled, cur, lang) : <span className="text-[#b3b5bc]">—</span>}</td>
              <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(x.reviewedAt ?? x.createdAt, lang)}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
