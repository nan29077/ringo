import Link from "next/link";
import { and, count, desc, eq, ilike, isNotNull, like, sql, type SQL } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { likeQ, listParams, one, periodWhere, type SP } from "@/lib/server/list";
import { compactJson } from "@/lib/server/admin-catalog";
import { formatDate } from "@/lib/i18n";
import { roleLabel } from "@/lib/status";
import { PageHeader, Panel, DataTable, EmptyState } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";
import { StatusBadge } from "@/components/console/status-badge";

export const metadata = { title: "Audit log" };

/** Admin pages for audit targets (when one exists). */
const targetHref: Record<string, (id: string) => string> = {
  product: (id) => `/admin/products/${id}`,
  order: (id) => `/admin/orders/${id}`,
  seller: (id) => `/admin/sellers/${id}`,
  user: (id) => `/admin/members/${id}`,
  coupon: (id) => `/admin/coupons/${id}`,
  banner: (id) => `/admin/banners/${id}`,
  notice: (id) => `/admin/notices/${id}`,
  inquiry: (id) => `/admin/inquiries/${id}`,
  settlement: (id) => `/admin/settlements/${id}`,
  category: (id) => `/admin/categories?edit=${id}`,
};

export default async function AdminAuditLog({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { page, size, offset } = listParams(sp, 50);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const where: (SQL | undefined)[] = [periodWhere(s.auditLogs.createdAt, sp)];
  const action = one(sp, "action").trim().slice(0, 60);
  if (action) where.push(like(s.auditLogs.action, `${action.replace(/[%_\\]/g, (m) => "\\" + m)}%`));
  const actor = one(sp, "actor").trim().slice(0, 100);
  if (actor) where.push(ilike(s.auditLogs.actorEmail, likeQ(actor)));
  if (one(sp, "targetType")) where.push(eq(s.auditLogs.targetType, one(sp, "targetType")));
  const target = one(sp, "target").trim().slice(0, 100);
  if (target) where.push(eq(s.auditLogs.targetId, target));
  if (["admin", "seller", "buyer"].includes(one(sp, "role"))) where.push(eq(s.auditLogs.actorRole, one(sp, "role")));
  const cond = and(...where);

  const [rows, [{ total }], types, prefixes] = await Promise.all([
    db.select().from(s.auditLogs).where(cond).orderBy(desc(s.auditLogs.createdAt), desc(s.auditLogs.id)).limit(size).offset(offset),
    db.select({ total: count() }).from(s.auditLogs).where(cond),
    db.selectDistinct({ v: s.auditLogs.targetType }).from(s.auditLogs).where(isNotNull(s.auditLogs.targetType)).orderBy(s.auditLogs.targetType),
    db.select({ v: sql<string>`split_part(${s.auditLogs.action}, '.', 1)`, n: sql<number>`count(*)::int` }).from(s.auditLogs).groupBy(sql`1`).orderBy(desc(sql`2`)).limit(12),
  ]);

  return (
    <>
      <PageHeader title={t("Audit log", "관리 작업 로그")} description={t("Who changed what: every operator and seller action recorded by the server.", "누가 무엇을 변경했는지 서버가 기록한 운영자·판매자 작업 로그입니다.")} actions={<Link href="/admin/logs/errors" className="rc-btn rc-btn-outline">{t("Error log", "에러 로그")}</Link>} />
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="mr-1 text-[#6b6e78]">{t("Quick filter", "빠른 필터")}</span>
        {prefixes.map((p) => (
          <Link key={p.v} href={`/admin/logs?action=${encodeURIComponent(p.v + ".")}`} className={`rounded-full border px-2.5 py-1 ${action === p.v + "." ? "border-[#1c1d22] bg-[#1c1d22] text-white" : "border-[#e1e3e8] bg-white text-[#3b3d46] hover:bg-[#f3f4f7]"}`}>
            {p.v} <span className="opacity-60">{p.n}</span>
          </Link>
        ))}
      </div>
      <FilterBar
        fields={[
          { type: "search", name: "action", placeholder: ["Action prefix, e.g. product.", "작업 코드 앞부분 (예: product.)"] },
          { type: "search", name: "actor", placeholder: ["Actor email", "작업자 이메일"] },
          { type: "select", name: "targetType", label: ["Target type", "대상 유형"], options: types.map((x) => ({ value: x.v!, en: x.v!, ko: x.v! })) },
          { type: "select", name: "role", label: ["Actor role", "작업자 권한"], options: [{ value: "admin", en: "Admin", ko: "관리자" }, { value: "seller", en: "Seller", ko: "판매자" }, { value: "buyer", en: "Buyer", ko: "구매자" }] },
          { type: "search", name: "target", placeholder: ["Target ID (exact)", "대상 ID (정확히 일치)"] },
          { type: "period" },
        ]}
      />
      <Panel title={<>{t("Entries", "로그")} <span className="ml-1 text-[#8a8d96]">{total.toLocaleString()}</span></>} bodyClass="p-0">
        <DataTable head={[t("Time", "일시"), t("Action", "작업"), t("Actor", "작업자"), t("Target", "대상"), t("Data", "내용"), "IP"]} empty={<EmptyState title={t("No log entries match these filters", "조건에 맞는 로그가 없습니다")} />} footer={<Pagination total={total} page={page} size={size} />}>
          {rows.map((r) => {
            const href = r.targetType && r.targetId ? targetHref[r.targetType]?.(r.targetId) : undefined;
            const json = r.data ? JSON.stringify(r.data) : "";
            return (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(r.createdAt, lang, true)}</td>
                <td className="whitespace-nowrap"><Link href={`/admin/logs?action=${encodeURIComponent(r.action)}`} className="rounded bg-[#f3f4f7] px-1.5 py-0.5 font-mono text-[11px] hover:bg-[#e9ebef]">{r.action}</Link></td>
                <td className="whitespace-nowrap text-xs">
                  {r.actorEmail ? <Link href={`/admin/logs?actor=${encodeURIComponent(r.actorEmail)}`} className="hover:underline">{r.actorEmail}</Link> : <span className="text-[#8a8d96]">{t("system", "시스템")}</span>}
                  {r.actorRole && <div className="mt-0.5"><StatusBadge map={roleLabel} value={r.actorRole} lang={lang} /></div>}
                </td>
                <td className="text-xs">
                  {r.targetType ? <span className="text-[#6b6e78]">{r.targetType}</span> : "—"}
                  {r.targetId && <div className="max-w-[180px] truncate font-mono text-[11px]">{href ? <Link href={href} className="text-[#2f4ac2] hover:underline">{r.targetId}</Link> : r.targetId}</div>}
                </td>
                <td className="max-w-[420px]">
                  {!json ? <span className="text-[#b3b5bc]">—</span> : json.length <= 120 ? (
                    <code className="block break-all font-mono text-[11px] text-[#5b5e68]">{json}</code>
                  ) : (
                    <details>
                      <summary className="cursor-pointer break-all font-mono text-[11px] text-[#5b5e68]">{compactJson(r.data, 120)}</summary>
                      <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-[#f8f9fb] p-2 font-mono text-[11px]">{JSON.stringify(r.data, null, 2)}</pre>
                    </details>
                  )}
                </td>
                <td className="whitespace-nowrap font-mono text-[11px] text-[#8a8d96]">{r.ip ?? "—"}</td>
              </tr>
            );
          })}
        </DataTable>
      </Panel>
    </>
  );
}
