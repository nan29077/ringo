import { desc } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { PageHeader } from "@/components/console/ui";
import { BannerForm } from "../banner-form";

export const metadata = { title: "New banner" };

export default async function AdminNewBanner() {
  await requireAdmin();
  const db = await getDb();
  const { t } = await getT("ko");
  const [last] = await db.select({ sort: s.banners.sort }).from(s.banners).orderBy(desc(s.banners.sort)).limit(1);
  return (
    <>
      <PageHeader title={t("Add banner", "배너 등록")} crumbs={[{ href: "/admin/banners", label: t("Banners", "배너 관리") }, { label: t("New", "등록") }]} />
      <BannerForm nextSort={(last?.sort ?? 0) + 10} startsValue="" endsValue="" />
    </>
  );
}
