import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Trash2 } from "lucide-react";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { toLocalInput } from "@/lib/server/seller-center";
import { isUuid } from "@/lib/server/admin-catalog";
import { mediaUrl } from "@/lib/server/storage";
import { PageHeader, Panel } from "@/components/console/ui";
import { ActionButton } from "@/components/common/action-form";
import { BannerForm } from "../banner-form";
import { deleteBanner } from "../actions";

export const metadata = { title: "Banner" };

export default async function AdminBannerDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const [banner] = await db.select().from(s.banners).where(eq(s.banners.id, id));
  if (!banner) notFound();
  const title = lang === "ko" ? banner.titleKo : banner.titleEn;
  const subtitle = lang === "ko" ? banner.subtitleKo : banner.subtitleEn;
  const cta = lang === "ko" ? banner.ctaKo : banner.ctaEn;
  return (
    <>
      <PageHeader
        title={title}
        crumbs={[{ href: "/admin/banners", label: t("Banners", "배너 관리") }, { label: title }]}
        actions={<ActionButton action={deleteBanner.bind(null, banner.id)} confirm={t("Delete this banner?", "이 배너를 삭제할까요?")} className="text-[#c0362c]"><Trash2 />{t("Delete", "삭제")}</ActionButton>}
      />
      <Panel title={t("Saved preview", "저장된 배너 미리보기")} className="mb-4" bodyClass="p-0">
        <div className="relative aspect-[1600/520] max-h-[300px] w-full overflow-hidden bg-[#f0f1f4]">
          <img src={mediaUrl(banner.imageKey)} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent" />
          <div className="absolute inset-y-0 left-0 flex max-w-[60%] flex-col justify-center gap-2 p-8 text-white">
            <div className="text-2xl font-bold leading-tight md:text-3xl">{title}</div>
            {subtitle && <div className="text-sm opacity-90">{subtitle}</div>}
            {cta && <span className="mt-2 inline-flex w-fit rounded-full bg-white px-4 py-2 text-xs font-semibold text-[#1c1d22]">{cta}</span>}
          </div>
        </div>
      </Panel>
      <BannerForm banner={banner} nextSort={banner.sort} startsValue={toLocalInput(banner.startsAt)} endsValue={toLocalInput(banner.endsAt)} />
    </>
  );
}
