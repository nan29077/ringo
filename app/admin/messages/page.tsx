import Link from "next/link";
import { and, count, desc, eq, ilike, isNotNull, or, sql, type SQL } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { likeQ, listParams, one, periodWhere, type SP } from "@/lib/server/list";
import { formatDate } from "@/lib/i18n";
import { PageHeader, Panel, DataTable, EmptyState, Badge, Notice, StatCard } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";

export const metadata = { title: "Sent emails" };

const mailTone = { sent: "green", logged: "gray", failed: "red" } as const;

export default async function AdminMessages({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { page, size, offset, q } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const smtp = !!process.env.SMTP_HOST;
  const where: (SQL | undefined)[] = [periodWhere(s.mailOutbox.createdAt, sp)];
  if (["sent", "logged", "failed"].includes(one(sp, "status"))) where.push(eq(s.mailOutbox.status, one(sp, "status") as "sent"));
  if (one(sp, "template")) where.push(eq(s.mailOutbox.template, one(sp, "template")));
  if (q) where.push(or(ilike(s.mailOutbox.to, likeQ(q)), ilike(s.mailOutbox.subject, likeQ(q))));
  const cond = and(...where);
  const [rows, [{ total }], templates, [summary]] = await Promise.all([
    db.select({ id: s.mailOutbox.id, to: s.mailOutbox.to, subject: s.mailOutbox.subject, template: s.mailOutbox.template, status: s.mailOutbox.status, error: s.mailOutbox.error, createdAt: s.mailOutbox.createdAt, preview: sql<string>`left(${s.mailOutbox.bodyText}, 140)` }).from(s.mailOutbox).where(cond).orderBy(desc(s.mailOutbox.createdAt)).limit(size).offset(offset),
    db.select({ total: count() }).from(s.mailOutbox).where(cond),
    db.selectDistinct({ template: s.mailOutbox.template }).from(s.mailOutbox).where(isNotNull(s.mailOutbox.template)).orderBy(s.mailOutbox.template),
    db
      .select({
        day: sql<number>`count(*) filter (where ${s.mailOutbox.createdAt} > now() - interval '1 day')::int`,
        sent: sql<number>`count(*) filter (where ${s.mailOutbox.status} = 'sent' and ${s.mailOutbox.createdAt} > now() - interval '7 days')::int`,
        logged: sql<number>`count(*) filter (where ${s.mailOutbox.status} = 'logged' and ${s.mailOutbox.createdAt} > now() - interval '7 days')::int`,
        failed: sql<number>`count(*) filter (where ${s.mailOutbox.status} = 'failed' and ${s.mailOutbox.createdAt} > now() - interval '7 days')::int`,
      })
      .from(s.mailOutbox),
  ]);
  const statusLabel = { sent: t("Sent", "발송 완료"), logged: t("Logged only", "기록만 됨"), failed: t("Failed", "발송 실패") };

  return (
    <>
      <PageHeader title={t("Sent emails", "보낸 메일")} description={t("Every email Ringo tried to send: verification, password reset, order, review and inquiry notifications.", "링고가 보낸 모든 메일(인증, 비밀번호 재설정, 주문, 심사, 문의 알림) 기록입니다.")} />
      <div className="mb-4">
        {smtp ? (
          <Notice tone="success">{t(`SMTP is configured (${process.env.SMTP_HOST}). Emails are delivered and recorded here.`, `SMTP가 설정되어 있습니다 (${process.env.SMTP_HOST}). 메일이 실제로 발송되고 여기에 기록됩니다.`)}</Notice>
        ) : (
          <Notice tone="warn">{t("SMTP is not configured (SMTP_HOST is empty). Emails are NOT delivered — they are only recorded here with status “Logged only”. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM (e.g. Amazon SES SMTP) to send real mail.", "SMTP가 설정되지 않았습니다 (SMTP_HOST 비어 있음). 메일은 실제로 발송되지 않고 '기록만 됨' 상태로 여기에만 저장됩니다. 실제 발송하려면 SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM(예: Amazon SES SMTP)을 설정하세요.")}</Notice>
        )}
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Last 24 hours", "최근 24시간")} value={summary.day} />
        <StatCard label={t("Sent · 7 days", "발송 완료 · 7일")} value={summary.sent} tone="good" />
        <StatCard label={t("Logged only · 7 days", "기록만 됨 · 7일")} value={summary.logged} />
        <StatCard label={t("Failed · 7 days", "발송 실패 · 7일")} value={summary.failed} tone={summary.failed ? "warn" : "default"} href="/admin/messages?status=failed" />
      </div>
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: ["Recipient or subject", "받는 사람 또는 제목"] },
          { type: "select", name: "status", label: ["Status", "상태"], options: [{ value: "sent", en: "Sent", ko: "발송 완료" }, { value: "logged", en: "Logged only", ko: "기록만 됨" }, { value: "failed", en: "Failed", ko: "발송 실패" }] },
          { type: "select", name: "template", label: ["Template", "템플릿"], options: templates.map((x) => ({ value: x.template!, en: x.template!, ko: x.template! })) },
          { type: "period" },
        ]}
      />
      <Panel title={<>{t("Emails", "메일")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
        <DataTable head={[t("Sent at", "일시"), t("To", "받는 사람"), t("Subject", "제목"), t("Template", "템플릿"), t("Status", "상태")]} empty={<EmptyState title={t("No emails", "메일 기록이 없습니다")} />} footer={<Pagination total={total} page={page} size={size} />}>
          {rows.map((m) => (
            <tr key={m.id}>
              <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(m.createdAt, lang, true)}</td>
              <td className="whitespace-nowrap">{m.to}</td>
              <td className="max-w-[420px]">
                <Link href={`/admin/messages/${m.id}`} className="block truncate font-semibold hover:underline">{m.subject}</Link>
                <div className="truncate text-[11px] text-[#8a8d96]">{m.preview}</div>
              </td>
              <td>{m.template ? <code className="rounded bg-[#f3f4f7] px-1.5 py-0.5 text-[11px]">{m.template}</code> : "—"}</td>
              <td className="whitespace-nowrap"><Badge tone={mailTone[m.status]}>{statusLabel[m.status]}</Badge>{m.error && <div className="max-w-[200px] truncate text-[11px] text-[#c0362c]" title={m.error}>{m.error}</div>}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
