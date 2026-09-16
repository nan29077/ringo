import { and, count, desc, eq, inArray } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireSeller } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { listParams, type SP } from "@/lib/server/list";
import { formatDate } from "@/lib/i18n";
import { PageHeader, Panel, EmptyState, Badge } from "@/components/console/ui";
import { Pagination } from "@/components/console/filters";

export const metadata = { title: "Notices" };

export default async function SellerNotices({ searchParams }: { searchParams: Promise<SP> }) {
  await requireSeller();
  const sp = await searchParams;
  const { page, size, offset } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const cond = and(eq(s.notices.published, true), inArray(s.notices.audience, ["all", "sellers"]));
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(s.notices).where(cond).orderBy(desc(s.notices.pinned), desc(s.notices.createdAt)).limit(size).offset(offset),
    db.select({ total: count() }).from(s.notices).where(cond),
  ]);
  return (
    <>
      <PageHeader title={t("Notices", "공지사항")} description={t("Announcements from the Ringo team for sellers.", "링고 운영팀이 판매자에게 전하는 공지입니다.")} />
      <Panel bodyClass="p-0">
        {rows.length ? (
          <div className="divide-y divide-[#eef0f3]">
            {rows.map((n, i) => (
              <details key={n.id} id={n.id} className="group px-5 py-4" open={i === 0 && page === 1}>
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  {n.pinned && <Badge tone="red">{t("Pinned", "중요")}</Badge>}
                  {n.audience === "sellers" && <Badge tone="blue">{t("Sellers", "판매자")}</Badge>}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1c1d22]">{n.title}</span>
                  <span className="whitespace-nowrap text-xs text-[#8a8d96]">{formatDate(n.createdAt, lang)}</span>
                </summary>
                <p className="!mt-3 whitespace-pre-wrap rounded-lg bg-[#f8f9fb] px-4 py-3 text-sm leading-relaxed text-[#3b3d46]">{n.body}</p>
              </details>
            ))}
          </div>
        ) : (
          <EmptyState title={t("No notices", "공지사항이 없습니다")} />
        )}
        {total > size && <Pagination total={total} page={page} size={size} />}
      </Panel>
    </>
  );
}
