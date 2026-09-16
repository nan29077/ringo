import { requireAdmin } from "@/lib/server/auth";
import { getT } from "@/lib/server/i18n-server";
import { PageHeader } from "@/components/console/ui";
import { NoticeForm } from "../notice-form";

export const metadata = { title: "New notice" };

export default async function AdminNewNotice() {
  await requireAdmin();
  const { t } = await getT("ko");
  return (
    <>
      <PageHeader title={t("New notice", "공지 등록")} crumbs={[{ href: "/admin/notices", label: t("Notices", "공지사항") }, { label: t("New", "등록") }]} />
      <NoticeForm t={t} />
    </>
  );
}
