import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { listParams, type SP } from "@/lib/server/list";
import { buyerOrderAgg, enumOpts, memberWhere } from "@/lib/server/admin-ops";
import { formatDate, formatMoney } from "@/lib/i18n";
import { roleLabel, sellerStatus, userStatus } from "@/lib/status";
import { PageHeader, Panel, DataTable, EmptyState, Badge } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";
import { StatusBadge } from "@/components/console/status-badge";

export const metadata = { title: "Members" };

export default async function AdminMembers({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { page, size, offset } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const settings = await getSettings(db);
  const cond = memberWhere(sp);
  const oa = buyerOrderAgg(db);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ u: s.users, sellerId: s.sellers.id, store: s.sellers.displayName, storeStatus: s.sellers.status, orders: oa.orders, paidOrders: oa.paidOrders, paidCents: oa.paidCents })
      .from(s.users)
      .leftJoin(s.sellers, eq(s.sellers.userId, s.users.id))
      .leftJoin(oa, eq(oa.buyerId, s.users.id))
      .where(cond)
      .orderBy(desc(s.users.createdAt), s.users.email)
      .limit(size)
      .offset(offset),
    db.select({ total: count() }).from(s.users).leftJoin(s.sellers, eq(s.sellers.userId, s.users.id)).where(cond),
  ]);

  return (
    <>
      <PageHeader title={t("Member list", "회원 목록")} description={t("Search members, check purchase history and manage account status.", "회원을 검색하고 구매 이력과 계정 상태를 관리하세요.")} />
      <FilterBar
        exportHref="/admin/members/export"
        fields={[
          { type: "search", name: "q", placeholder: ["Name, email, phone or store", "이름, 이메일, 연락처, 스토어명"] },
          { type: "select", name: "role", label: ["Role", "회원구분"], options: enumOpts(roleLabel) },
          { type: "select", name: "status", label: ["Status", "상태"], options: enumOpts(userStatus) },
          { type: "select", name: "verified", label: ["Email verified", "이메일 인증"], options: [{ value: "yes", en: "Verified", ko: "인증" }, { value: "no", en: "Not verified", ko: "미인증" }] },
          { type: "select", name: "marketing", label: ["Marketing", "마케팅 수신"], options: [{ value: "yes", en: "Opted in", ko: "동의" }, { value: "no", en: "Opted out", ko: "거부" }] },
          { type: "period" },
        ]}
      />
      <Panel title={<>{t("Members", "회원")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
        <DataTable
          head={[t("Member", "회원"), t("Role", "구분"), t("Store", "스토어"), t("Status", "상태"), t("Email", "이메일 인증"), t("Orders", "주문"), t("Paid total", "결제 금액"), t("Last login", "최근 로그인"), t("Joined", "가입일")]}
          empty={<EmptyState title={t("No members match these filters.", "조건에 맞는 회원이 없습니다.")} />}
          footer={<Pagination total={total} page={page} size={size} />}
        >
          {rows.map(({ u, sellerId, store, storeStatus, orders, paidOrders, paidCents }) => (
            <tr key={u.id}>
              <td>
                <Link href={`/admin/members/${u.id}`} className="font-semibold hover:underline">{u.name}</Link>
                <div className="text-[11px] text-[#8a8d96]">{u.email}{u.phone ? ` · ${u.phone}` : ""}</div>
              </td>
              <td><StatusBadge map={roleLabel} value={u.role} lang={lang} /></td>
              <td className="text-xs">{sellerId ? <><Link href={`/admin/sellers/${sellerId}`} className="hover:underline">{store}</Link><div className="mt-0.5"><StatusBadge map={sellerStatus} value={storeStatus} lang={lang} /></div></> : <span className="text-[#b3b5bc]">—</span>}</td>
              <td><StatusBadge map={userStatus} value={u.status} lang={lang} /></td>
              <td>{u.emailVerifiedAt ? <Badge tone="green">{t("Verified", "인증")}</Badge> : <Badge>{t("Unverified", "미인증")}</Badge>}{u.marketingOptIn && <div className="mt-0.5 text-[11px] text-[#8a8d96]">{t("Marketing ✓", "마케팅 동의")}</div>}</td>
              <td className="whitespace-nowrap">{orders ? <Link href={`/admin/orders?buyer=${u.id}`} className="hover:underline">{paidOrders ?? 0}<span className="text-xs text-[#8a8d96]"> / {orders}</span></Link> : <span className="text-[#b3b5bc]">0</span>}</td>
              <td className="whitespace-nowrap font-medium">{paidCents ? formatMoney(paidCents, settings.site.currency, lang) : <span className="text-[#b3b5bc]">—</span>}</td>
              <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(u.lastLoginAt, lang, true)}</td>
              <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(u.createdAt, lang)}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
