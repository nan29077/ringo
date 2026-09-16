import Link from "next/link";
import { and, count, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { likeQ, listParams, one, periodWhere, type SP } from "@/lib/server/list";
import { formatDate } from "@/lib/i18n";
import { PageHeader, Panel, DataTable, EmptyState, Badge, StatCard } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";

export const metadata = { title: "Error log" };

export default async function AdminErrorLog({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { page, size, offset, q } = listParams(sp, 50);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const where: (SQL | undefined)[] = [periodWhere(s.errorLogs.createdAt, sp)];
  if (one(sp, "source")) where.push(eq(s.errorLogs.source, one(sp, "source")));
  if (q) where.push(ilike(s.errorLogs.message, likeQ(q)));
  const cond = and(...where);
  const [rows, [{ total }], sources] = await Promise.all([
    db.select().from(s.errorLogs).where(cond).orderBy(desc(s.errorLogs.createdAt), desc(s.errorLogs.id)).limit(size).offset(offset),
    db.select({ total: count() }).from(s.errorLogs).where(cond),
    db
      .select({ source: s.errorLogs.source, total: sql<number>`count(*)::int`, day: sql<number>`count(*) filter (where ${s.errorLogs.createdAt} > now() - interval '1 day')::int`, last: sql<string>`max(${s.errorLogs.createdAt})` })
      .from(s.errorLogs)
      .groupBy(s.errorLogs.source)
      .orderBy(desc(sql`3`), desc(sql`2`)),
  ]);
  const day = sources.reduce((a, x) => a + x.day, 0);

  return (
    <>
      <PageHeader title={t("Error log", "에러 로그")} description={t("Server-side failures: payment gateway calls and webhooks, email delivery, unexpected action errors.", "서버에서 발생한 오류입니다: 결제사(PG) API·웹훅, 메일 발송, 처리 중 예기치 못한 오류.")} actions={<Link href="/admin/logs" className="rc-btn rc-btn-outline">{t("Audit log", "관리 작업 로그")}</Link>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Errors · 24 hours", "최근 24시간 에러")} value={day} tone={day ? "warn" : "good"} />
        {sources.slice(0, 3).map((x) => (
          <StatCard key={x.source} label={x.source} value={x.total.toLocaleString()} hint={t(`${x.day} in 24h · last ${formatDate(x.last, "en", true)}`, `24시간 ${x.day}건 · 최근 ${formatDate(x.last, "ko", true)}`)} href={`/admin/logs/errors?source=${encodeURIComponent(x.source)}`} />
        ))}
      </div>
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: ["Message text", "에러 메시지 검색"] },
          { type: "select", name: "source", label: ["Source", "발생 위치"], options: sources.map((x) => ({ value: x.source, en: `${x.source} (${x.total})`, ko: `${x.source} (${x.total})` })) },
          { type: "period" },
        ]}
      />
      <Panel title={<>{t("Errors", "에러")} <span className="ml-1 text-[#8a8d96]">{total.toLocaleString()}</span></>} description={t("Click a row to expand the full message and data.", "행을 눌러 전체 메시지와 데이터를 펼쳐 보세요.")} bodyClass="p-0">
        <DataTable head={[t("Time", "일시"), t("Source", "발생 위치"), t("Message", "메시지")]} empty={<EmptyState title={t("No errors recorded", "기록된 에러가 없습니다")} description={t("Nice — nothing has failed in this period.", "해당 기간에 발생한 에러가 없습니다.")} />} footer={<Pagination total={total} page={page} size={size} />}>
          {rows.map((r) => {
            const firstLine = r.message.split("\n")[0].slice(0, 200);
            return (
              <tr key={r.id} className="align-top">
                <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(r.createdAt, lang, true)}<div className="font-mono text-[10px] text-[#b3b5bc]">#{r.id}</div></td>
                <td className="whitespace-nowrap"><Link href={`/admin/logs/errors?source=${encodeURIComponent(r.source)}`}><Badge tone={r.source.includes("payment") || r.source.includes("webhook") ? "red" : r.source === "mail" ? "amber" : "gray"}>{r.source}</Badge></Link></td>
                <td className="max-w-[760px]">
                  <details>
                    <summary className="cursor-pointer break-all font-mono text-xs text-[#1c1d22]">{firstLine}{r.message.length > firstLine.length || r.data ? " …" : ""}</summary>
                    <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-[#f8f9fb] p-3 font-mono text-[11px] leading-relaxed">{r.message}</pre>
                    {r.data != null && (
                      <>
                        <div className="mt-2 text-[11px] font-semibold text-[#6b6e78]">data</div>
                        <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-[#f8f9fb] p-3 font-mono text-[11px]">{JSON.stringify(r.data, null, 2)}</pre>
                      </>
                    )}
                  </details>
                </td>
              </tr>
            );
          })}
        </DataTable>
      </Panel>
    </>
  );
}
