import Link from "next/link";
import { and, count, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { likeQ, listParams, one, periodWhere, type SP } from "@/lib/server/list";
import { formatDate } from "@/lib/i18n";
import { inquiryStatus } from "@/lib/status";
import { PageHeader, Panel, DataTable, EmptyState, Badge, StatCard } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";
import { StatusBadge } from "@/components/console/status-badge";
import { inquiryCategories } from "./labels";

export const metadata = { title: "Inquiries" };

export default async function AdminInquiries({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { page, size, offset, q } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const where: (SQL | undefined)[] = [periodWhere(s.inquiries.createdAt, sp)];
  const st = one(sp, "status");
  if (["open", "answered", "closed"].includes(st)) where.push(eq(s.inquiries.status, st as s.InquiryStatus));
  if (one(sp, "route") === "platform") where.push(isNull(s.inquiries.sellerId));
  if (one(sp, "route") === "seller") where.push(isNotNull(s.inquiries.sellerId));
  if (one(sp, "category") in inquiryCategories) where.push(eq(s.inquiries.category, one(sp, "category")));
  if (q) where.push(or(ilike(s.inquiries.subject, likeQ(q)), ilike(s.users.email, likeQ(q)), ilike(s.users.name, likeQ(q))));
  const cond = and(...where);

  const lastMessage = db
    .select({
      inquiryId: s.inquiryMessages.inquiryId,
      n: sql<number>`count(*)::int`.as("n"),
      lastAt: sql<Date>`max(${s.inquiryMessages.createdAt})`.as("last_at"),
    })
    .from(s.inquiryMessages)
    .groupBy(s.inquiryMessages.inquiryId)
    .as("msg");

  const [rows, [{ total }], [summary]] = await Promise.all([
    db
      .select({
        i: s.inquiries,
        userName: s.users.name,
        userEmail: s.users.email,
        seller: s.sellers.displayName,
        productTitleEn: s.products.titleEn,
        productTitleKo: s.products.titleKo,
        orderNo: s.orders.orderNo,
        messages: sql<number>`coalesce(${lastMessage.n},0)::int`,
      })
      .from(s.inquiries)
      .innerJoin(s.users, eq(s.users.id, s.inquiries.userId))
      .leftJoin(s.sellers, eq(s.sellers.id, s.inquiries.sellerId))
      .leftJoin(s.products, eq(s.products.id, s.inquiries.productId))
      .leftJoin(s.orders, eq(s.orders.id, s.inquiries.orderId))
      .leftJoin(lastMessage, eq(lastMessage.inquiryId, s.inquiries.id))
      .where(cond)
      .orderBy(
        sql`case ${s.inquiries.status} when 'open' then 0 when 'answered' then 1 else 2 end`,
        sql`case when ${s.inquiries.status} = 'open' then extract(epoch from ${s.inquiries.createdAt}) else -extract(epoch from ${s.inquiries.updatedAt}) end`,
      )
      .limit(size)
      .offset(offset),
    db.select({ total: count() }).from(s.inquiries).innerJoin(s.users, eq(s.users.id, s.inquiries.userId)).where(cond),
    db
      .select({
        open: sql<number>`count(*) filter (where ${s.inquiries.status} = 'open')::int`,
        openPlatform: sql<number>`count(*) filter (where ${s.inquiries.status} = 'open' and ${s.inquiries.sellerId} is null)::int`,
        openSeller: sql<number>`count(*) filter (where ${s.inquiries.status} = 'open' and ${s.inquiries.sellerId} is not null)::int`,
        stale: sql<number>`count(*) filter (where ${s.inquiries.status} = 'open' and ${s.inquiries.updatedAt} < now() - interval '2 days')::int`,
        week: sql<number>`count(*) filter (where ${s.inquiries.createdAt} > now() - interval '7 days')::int`,
      })
      .from(s.inquiries),
  ]);
  const now = Date.now();

  return (
    <>
      <PageHeader title={t("Inquiries", "1:1 문의")} description={t("All customer inquiries. Account and payment questions go to platform support; product and order questions are routed to the seller, but operators can answer any thread.", "전체 고객 문의입니다. 계정·결제 문의는 플랫폼으로, 상품·주문 문의는 판매자에게 배정되며 운영자는 모든 문의에 답변할 수 있습니다.")} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Awaiting platform answer", "플랫폼 답변 대기")} value={summary.openPlatform} tone={summary.openPlatform ? "warn" : "default"} href="/admin/inquiries?status=open&route=platform" />
        <StatCard label={t("Awaiting seller answer", "판매자 답변 대기")} value={summary.openSeller} href="/admin/inquiries?status=open&route=seller" />
        <StatCard label={t("Open for 2+ days", "2일 이상 미답변")} value={summary.stale} tone={summary.stale ? "warn" : "default"} />
        <StatCard label={t("New · 7 days", "최근 7일 접수")} value={summary.week} />
      </div>
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: ["Subject, customer name or email", "제목, 고객명, 이메일"] },
          { type: "select", name: "status", label: ["Status", "상태"], options: Object.entries(inquiryStatus).map(([value, v]) => ({ value, en: v.en, ko: v.ko })) },
          { type: "select", name: "route", label: ["Routed to", "담당"], options: [{ value: "platform", en: "Platform", ko: "플랫폼" }, { value: "seller", en: "Seller", ko: "판매자" }] },
          { type: "select", name: "category", label: ["Category", "유형"], options: Object.entries(inquiryCategories).map(([value, [en, ko]]) => ({ value, en, ko })) },
          { type: "period" },
        ]}
      />
      <Panel title={<>{t("Inquiries", "문의")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} description={t("Open first (oldest first), then recently updated", "답변 대기(오래된 순) → 최근 활동 순")} bodyClass="p-0">
        <DataTable
          head={[t("Subject", "제목"), t("Customer", "고객"), t("Routed to", "담당"), t("Category", "유형"), t("Related to", "관련 상품/주문"), t("Messages", "메시지"), t("Status", "상태"), t("Waiting / updated", "대기 · 최근 활동")]}
          empty={<EmptyState title={t("No inquiries match these filters", "조건에 맞는 문의가 없습니다")} />}
          footer={<Pagination total={total} page={page} size={size} />}
        >
          {rows.map((r) => {
            const hours = Math.floor((now - r.i.createdAt.getTime()) / 3600000);
            const cat = inquiryCategories[r.i.category];
            return (
              <tr key={r.i.id}>
                <td><Link href={`/admin/inquiries/${r.i.id}`} className="block max-w-[300px] truncate font-semibold hover:underline">{r.i.subject}</Link><div className="text-[11px] text-[#8a8d96]">{formatDate(r.i.createdAt, lang, true)}</div></td>
                <td className="whitespace-nowrap">{r.userName}<div className="text-[11px] text-[#8a8d96]">{r.userEmail}</div></td>
                <td className="whitespace-nowrap">{r.i.sellerId ? <><Badge tone="blue">{t("Seller", "판매자")}</Badge><div className="mt-0.5 text-[11px]">{r.seller}</div></> : <Badge tone="violet">{t("Platform", "플랫폼")}</Badge>}</td>
                <td className="whitespace-nowrap text-xs">{cat ? t(cat[0], cat[1]) : r.i.category}</td>
                <td className="max-w-[200px] truncate text-xs">{r.orderNo ?? (lang === "ko" ? r.productTitleKo : r.productTitleEn) ?? "—"}</td>
                <td>{r.messages}</td>
                <td><StatusBadge map={inquiryStatus} value={r.i.status} lang={lang} /></td>
                <td className="whitespace-nowrap text-xs">
                  {r.i.status === "open" ? <span className={hours >= 48 ? "font-semibold text-[#c0362c]" : "text-[#a45c00]"}>{hours >= 24 ? t(`${Math.floor(hours / 24)}d waiting`, `${Math.floor(hours / 24)}일 대기`) : t(`${hours}h waiting`, `${hours}시간 대기`)}</span> : <span className="text-[#6b6e78]">{formatDate(r.i.updatedAt, lang, true)}</span>}
                </td>
              </tr>
            );
          })}
        </DataTable>
      </Panel>
    </>
  );
}
