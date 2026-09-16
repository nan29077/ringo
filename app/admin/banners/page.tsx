import Link from "next/link";
import { asc } from "drizzle-orm";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { mediaUrl } from "@/lib/server/storage";
import { formatDate } from "@/lib/i18n";
import { PageHeader, Panel, DataTable, EmptyState, Badge } from "@/components/console/ui";
import { ActionButton } from "@/components/common/action-form";
import { moveBanner, toggleBanner } from "./actions";

export const metadata = { title: "Banners" };

export default async function AdminBanners() {
  await requireAdmin();
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const rows = await db.select().from(s.banners).orderBy(asc(s.banners.sort), asc(s.banners.createdAt));
  const now = Date.now();
  const live = rows.filter((b) => b.active && (!b.startsAt || b.startsAt.getTime() <= now) && (!b.endsAt || b.endsAt.getTime() > now)).length;

  return (
    <>
      <PageHeader
        title={t("Banners", "배너 관리")}
        description={t(`Storefront hero banners, shown in this order. ${live} currently live.`, `스토어 메인 상단 배너입니다. 아래 순서대로 노출되며 현재 ${live}개가 노출 중입니다.`)}
        actions={<Link href="/admin/banners/new" className="rc-btn rc-btn-primary"><Plus />{t("Add banner", "배너 등록")}</Link>}
      />
      <Panel title={<>{t("Banners", "배너")} <span className="ml-1 text-[#8a8d96]">{rows.length}</span></>} bodyClass="p-0">
        <DataTable
          head={[t("Order", "순서"), t("Preview", "미리보기"), t("Title", "제목"), t("Link", "연결 URL"), t("Schedule", "노출 기간"), t("State", "상태"), ""]}
          empty={<EmptyState title={t("No banners yet", "등록된 배너가 없습니다")} action={<Link href="/admin/banners/new" className="rc-btn rc-btn-outline rc-btn-sm"><Plus />{t("Add banner", "배너 등록")}</Link>} />}
        >
          {rows.map((b, i) => {
            const scheduled = !!b.startsAt && b.startsAt.getTime() > now;
            const ended = !!b.endsAt && b.endsAt.getTime() <= now;
            return (
              <tr key={b.id}>
                <td className="whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <span className="w-5 text-xs font-bold text-[#8a8d96]">{i + 1}</span>
                    <ActionButton size="icon-sm" variant="ghost" action={moveBanner.bind(null, b.id, "up")} className={i === 0 ? "invisible" : ""}><ArrowUp /><span className="sr-only">{t("Move up", "위로")}</span></ActionButton>
                    <ActionButton size="icon-sm" variant="ghost" action={moveBanner.bind(null, b.id, "down")} className={i === rows.length - 1 ? "invisible" : ""}><ArrowDown /><span className="sr-only">{t("Move down", "아래로")}</span></ActionButton>
                  </div>
                </td>
                <td><img src={mediaUrl(b.imageKey)} alt="" className="h-14 w-36 rounded-lg border border-[#e9ebef] object-cover" /></td>
                <td className="max-w-[300px]">
                  <Link href={`/admin/banners/${b.id}`} className="block truncate font-semibold hover:underline">{lang === "ko" ? b.titleKo : b.titleEn}</Link>
                  <div className="truncate text-[11px] text-[#8a8d96]">{lang === "ko" ? b.titleEn : b.titleKo}</div>
                  {(b.ctaKo || b.ctaEn) && <div className="mt-0.5 text-[11px] text-[#5b5e68]">CTA: {lang === "ko" ? b.ctaKo || b.ctaEn : b.ctaEn || b.ctaKo}</div>}
                </td>
                <td className="max-w-[200px] truncate"><code className="text-[11px]">{b.linkUrl ?? "—"}</code></td>
                <td className="whitespace-nowrap text-[11px] text-[#5b5e68]">{b.startsAt || b.endsAt ? `${formatDate(b.startsAt, lang, true)} ~ ${formatDate(b.endsAt, lang, true)}` : t("Always", "상시")}</td>
                <td className="whitespace-nowrap">
                  <ActionButton size="xs" variant="ghost" action={toggleBanner.bind(null, b.id)}>
                    {!b.active ? <Badge>{t("Hidden", "숨김")}</Badge> : ended ? <Badge tone="gray">{t("Ended", "기간 종료")}</Badge> : scheduled ? <Badge tone="blue">{t("Scheduled", "예약")}</Badge> : <Badge tone="green">{t("Live", "노출중")}</Badge>}
                  </ActionButton>
                </td>
                <td className="text-right"><Link href={`/admin/banners/${b.id}`} className="rc-btn rc-btn-outline rc-btn-sm"><Pencil />{t("Edit", "수정")}</Link></td>
              </tr>
            );
          })}
        </DataTable>
      </Panel>
    </>
  );
}
