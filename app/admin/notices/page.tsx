import Link from "next/link";
import { and, count, desc, eq, ilike, type SQL } from "drizzle-orm";
import { Pin, Plus } from "lucide-react";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { likeQ, listParams, one, periodWhere, type SP } from "@/lib/server/list";
import { formatDate } from "@/lib/i18n";
import { PageHeader, Panel, DataTable, EmptyState, Badge } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";
import { ActionButton } from "@/components/common/action-form";
import { toggleNoticeFlag } from "./actions";

export const metadata = { title: "Notices" };

export default async function AdminNotices({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { page, size, offset, q } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const where: (SQL | undefined)[] = [periodWhere(s.notices.createdAt, sp)];
  if (q) where.push(ilike(s.notices.title, likeQ(q)));
  if (["all", "sellers", "buyers"].includes(one(sp, "audience"))) where.push(eq(s.notices.audience, one(sp, "audience") as "all"));
  if (one(sp, "published")) where.push(eq(s.notices.published, one(sp, "published") === "yes"));
  const cond = and(...where);
  const [rows, [{ total }]] = await Promise.all([
    db.select({ n: s.notices, author: s.users.name }).from(s.notices).leftJoin(s.users, eq(s.users.id, s.notices.createdBy)).where(cond).orderBy(desc(s.notices.pinned), desc(s.notices.createdAt)).limit(size).offset(offset),
    db.select({ total: count() }).from(s.notices).where(cond),
  ]);
  const audience = { all: [t("Everyone", "전체"), "gray"], sellers: [t("Sellers", "판매자"), "blue"], buyers: [t("Buyers", "구매자"), "violet"] } as const;

  return (
    <>
      <PageHeader title={t("Notices", "공지사항")} description={t("Announcements for buyers in the store and sellers in the seller center.", "스토어 구매자와 판매자센터 판매자에게 보여줄 공지사항입니다.")} actions={<Link href="/admin/notices/new" className="rc-btn rc-btn-primary"><Plus />{t("New notice", "공지 등록")}</Link>} />
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: ["Title", "제목 검색"] },
          { type: "select", name: "audience", label: ["Audience", "공개 대상"], options: [{ value: "all", en: "Everyone", ko: "전체" }, { value: "sellers", en: "Sellers", ko: "판매자" }, { value: "buyers", en: "Buyers", ko: "구매자" }] },
          { type: "select", name: "published", label: ["Published", "게시 여부"], options: [{ value: "yes", en: "Published", ko: "게시" }, { value: "no", en: "Draft", ko: "미게시" }] },
          { type: "period" },
        ]}
      />
      <Panel title={<>{t("Notices", "공지")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
        <DataTable head={[t("Title", "제목"), t("Audience", "공개 대상"), t("Pinned", "고정"), t("Published", "게시"), t("Author", "작성자"), t("Created", "등록일"), t("Updated", "수정일")]} empty={<EmptyState title={t("No notices", "공지사항이 없습니다")} />} footer={<Pagination total={total} page={page} size={size} />}>
          {rows.map(({ n, author }) => (
            <tr key={n.id}>
              <td className="max-w-[420px]">
                <Link href={`/admin/notices/${n.id}`} className="flex items-center gap-1.5 font-semibold hover:underline">{n.pinned && <Pin className="size-3.5 shrink-0 text-[#ed4b2e]" />}<span className="truncate">{n.title}</span></Link>
                <div className="truncate text-[11px] text-[#8a8d96]">{n.body.slice(0, 120)}</div>
              </td>
              <td><Badge tone={audience[n.audience][1]}>{audience[n.audience][0]}</Badge></td>
              <td><ActionButton size="xs" variant="ghost" action={toggleNoticeFlag.bind(null, n.id, "pinned")}>{n.pinned ? <Badge tone="red">{t("Pinned", "고정")}</Badge> : <span className="text-xs text-[#b3b5bc]">—</span>}</ActionButton></td>
              <td><ActionButton size="xs" variant="ghost" action={toggleNoticeFlag.bind(null, n.id, "published")}>{n.published ? <Badge tone="green">{t("Published", "게시중")}</Badge> : <Badge>{t("Draft", "미게시")}</Badge>}</ActionButton></td>
              <td className="whitespace-nowrap text-xs">{author ?? "—"}</td>
              <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(n.createdAt, lang)}</td>
              <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(n.updatedAt, lang, true)}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
