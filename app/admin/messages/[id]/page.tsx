import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { isUuid } from "@/lib/server/admin-catalog";
import { formatDate } from "@/lib/i18n";
import { PageHeader, Panel, DetailList, Badge, Notice } from "@/components/console/ui";

export const metadata = { title: "Email" };

export default async function AdminMessageDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const [m] = await db.select().from(s.mailOutbox).where(eq(s.mailOutbox.id, id));
  if (!m) notFound();
  const tone = { sent: "green", logged: "gray", failed: "red" }[m.status];
  const label = { sent: t("Sent", "발송 완료"), logged: t("Logged only (not delivered)", "기록만 됨 (미발송)"), failed: t("Failed", "발송 실패") }[m.status];
  return (
    <>
      <PageHeader title={m.subject} crumbs={[{ href: "/admin/messages", label: t("Sent emails", "보낸 메일") }, { label: m.subject }]} />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Panel title={t("Body (plain text)", "본문 (텍스트)")}>
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-[#f8f9fb] p-4 font-sans text-sm leading-relaxed text-[#1c1d22]">{m.bodyText}</pre>
        </Panel>
        <Panel title={t("Delivery", "발송 정보")} className="self-start">
          <DetailList
            items={[
              [t("To", "받는 사람"), m.to],
              [t("Template", "템플릿"), m.template ?? "—"],
              [t("Status", "상태"), <Badge key="s" tone={tone}>{label}</Badge>],
              [t("Created", "일시"), formatDate(m.createdAt, lang, true)],
            ]}
          />
          {m.error && <div className="mt-4"><Notice tone="danger"><b>{t("Error", "오류")}</b>: {m.error}</Notice></div>}
        </Panel>
      </div>
    </>
  );
}
