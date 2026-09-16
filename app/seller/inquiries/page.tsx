import Link from "next/link";
import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { likeQ, listParams, one, periodWhere, type SP } from "@/lib/server/list";
import { formatDate } from "@/lib/i18n";
import { inquiryStatus } from "@/lib/status";
import { PageHeader, Panel, DataTable, EmptyState } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";
import { StatusBadge } from "@/components/console/status-badge";

export const metadata = { title: "Customer inquiries" };

export default async function SellerInquiries({ searchParams }: { searchParams: Promise<SP> }) {
  const viewer = await requireSeller();
  const sp = await searchParams;
  const { page, size, offset, q } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const where: (SQL | undefined)[] = [eq(s.inquiries.sellerId, viewer.seller.id), periodWhere(s.inquiries.createdAt, sp)];
  const st = one(sp, "status");
  if (["open", "answered", "closed"].includes(st)) where.push(eq(s.inquiries.status, st as s.InquiryStatus));
  if (q) where.push(or(ilike(s.inquiries.subject, likeQ(q)), ilike(s.users.name, likeQ(q)), ilike(s.users.email, likeQ(q))));
  const cond = and(...where);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        i: s.inquiries,
        userName: s.users.name,
        productTitleEn: s.products.titleEn,
        productTitleKo: s.products.titleKo,
        orderNo: s.orders.orderNo,
        messages: sql<number>`(select count(*) from ${s.inquiryMessages} where ${s.inquiryMessages.inquiryId} = ${s.inquiries.id})::int`,
      })
      .from(s.inquiries)
      .innerJoin(s.users, eq(s.users.id, s.inquiries.userId))
      .leftJoin(s.products, eq(s.products.id, s.inquiries.productId))
      .leftJoin(s.orders, eq(s.orders.id, s.inquiries.orderId))
      .where(cond)
      .orderBy(sql`case when ${s.inquiries.status} = 'open' then 0 else 1 end`, desc(s.inquiries.updatedAt))
      .limit(size)
      .offset(offset),
    db.select({ total: count() }).from(s.inquiries).innerJoin(s.users, eq(s.users.id, s.inquiries.userId)).where(cond),
  ]);
  return (
    <>
      <PageHeader title={t("Customer inquiries", "고객 문의")} description={t("Questions from buyers about your products and orders.", "내 상품과 주문에 대한 구매자 문의입니다.")} />
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: ["Subject or customer", "제목 또는 고객명"] },
          { type: "select", name: "status", label: ["Status", "상태"], options: Object.entries(inquiryStatus).map(([value, v]) => ({ value, en: v.en, ko: v.ko })) },
          { type: "period" },
        ]}
      />
      <Panel title={<>{t("Inquiries", "문의")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
        <DataTable head={[t("Subject", "제목"), t("Customer", "고객"), t("Related to", "관련 상품/주문"), t("Messages", "메시지"), t("Status", "상태"), t("Updated", "최근 활동")]} empty={<EmptyState title={t("No inquiries", "문의가 없습니다")} />} footer={<Pagination total={total} page={page} size={size} />}>
          {rows.map((r) => (
            <tr key={r.i.id}>
              <td><Link href={`/seller/inquiries/${r.i.id}`} className="block max-w-[340px] truncate font-semibold hover:underline">{r.i.subject}</Link><div className="text-[11px] text-[#8a8d96]">{formatDate(r.i.createdAt, lang, true)}</div></td>
              <td className="whitespace-nowrap">{r.userName}</td>
              <td className="max-w-[220px] truncate text-xs">{r.orderNo ?? (lang === "ko" ? r.productTitleKo : r.productTitleEn) ?? "—"}</td>
              <td>{r.messages}</td>
              <td><StatusBadge map={inquiryStatus} value={r.i.status} lang={lang} /></td>
              <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(r.i.updatedAt, lang, true)}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
