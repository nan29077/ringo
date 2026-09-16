import type { Metadata } from "next";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Megaphone, Pin } from "lucide-react";
import * as s from "@/db/schema";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { formatDate } from "@/lib/i18n";

export const metadata: Metadata = { title: "Notices", description: "Announcements from the Ringo team." };

export default async function NoticesPage() {
  const { t, lang } = await getT();
  const db = await getDb();
  const rows = await db
    .select()
    .from(s.notices)
    .where(and(eq(s.notices.published, true), inArray(s.notices.audience, ["all", "buyers"])))
    .orderBy(desc(s.notices.pinned), desc(s.notices.createdAt))
    .limit(100);
  return (
    <main className="shell sf-page">
      <div className="mx-auto max-w-[820px]">
        <p className="sf-kicker">{t("From the Ringo team", "링고 팀 소식")}</p>
        <h1 className="sf-h1">{t("Notices", "공지사항")}</h1>
        {rows.length === 0 ? (
          <div className="sf-empty"><Megaphone aria-hidden /><h3>{t("No notices right now", "등록된 공지사항이 없습니다")}</h3></div>
        ) : (
          <ul className="mt-8 grid gap-3">
            {rows.map((n) => (
              <li key={n.id}>
                <details className="sf-card group" open={n.pinned}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4">
                    {n.pinned && <Pin size={16} className="text-[#ed4b2e]" aria-label={t("Pinned", "고정")} />}
                    <span className="min-w-0 flex-1 font-semibold text-[#20211f]">{n.title}</span>
                    <time className="text-[13px] text-[#6b7065]" dateTime={n.createdAt.toISOString()}>{formatDate(n.createdAt, lang)}</time>
                  </summary>
                  <div className="whitespace-pre-line border-t border-[#efefeb] px-5 py-4 text-[15px] leading-relaxed text-[#4f534a]">{n.body}</div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
