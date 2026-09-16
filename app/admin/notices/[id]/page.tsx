import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Trash2 } from "lucide-react";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { isUuid } from "@/lib/server/admin-catalog";
import { formatDate } from "@/lib/i18n";
import { PageHeader } from "@/components/console/ui";
import { ActionButton } from "@/components/common/action-form";
import { NoticeForm } from "../notice-form";
import { deleteNotice } from "../actions";

export const metadata = { title: "Notice" };

export default async function AdminNoticeDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const [notice] = await db.select().from(s.notices).where(eq(s.notices.id, id));
  if (!notice) notFound();
  return (
    <>
      <PageHeader
        title={notice.title}
        description={t(`Created ${formatDate(notice.createdAt, lang, true)} · updated ${formatDate(notice.updatedAt, lang, true)}`, `등록 ${formatDate(notice.createdAt, lang, true)} · 수정 ${formatDate(notice.updatedAt, lang, true)}`)}
        crumbs={[{ href: "/admin/notices", label: t("Notices", "공지사항") }, { label: notice.title }]}
        actions={<ActionButton action={deleteNotice.bind(null, notice.id)} confirm={t("Delete this notice?", "이 공지사항을 삭제할까요?")} className="text-[#c0362c]"><Trash2 />{t("Delete", "삭제")}</ActionButton>}
      />
      <NoticeForm notice={notice} t={t} />
    </>
  );
}
