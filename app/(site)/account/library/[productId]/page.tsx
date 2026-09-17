import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { Clock, Download, ExternalLink, FileText, MessageCircle } from "lucide-react";
import * as s from "@/db/schema";
import { requireViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { mediaUrl } from "@/lib/server/storage";
import { activeEntitlement, isUuid, pick } from "@/lib/server/storefront";
import { bytes, formatDate, n } from "@/lib/i18n";
import { deliveryType, label } from "@/lib/status";
import { AccountHeader, Card } from "@/components/store/account-ui";
import { LessonPlayer } from "@/components/store/lesson-player";
import { LessonToggle } from "./lesson-toggle";

export const metadata = { title: "Library item" };

export default async function LibraryItem({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const viewer = await requireViewer(`/account/library/${productId}`);
  if (!isUuid(productId)) notFound();
  const db = await getDb();
  const entitlement = await activeEntitlement(db, viewer.user.id, productId);
  if (!entitlement) notFound();
  const { t, lang } = await getT();
  const [row] = await db.select({ product: s.products, seller: s.sellers }).from(s.products).innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId)).where(eq(s.products.id, productId));
  if (!row) notFound();
  const { product: p, seller } = row;
  if (p.deliveryType === "service") redirect(`/account/orders/${entitlement.orderId}`);
  const [files, progress] = await Promise.all([
    db.select().from(s.productAssets).where(eq(s.productAssets.productId, p.id)).orderBy(asc(s.productAssets.sort), asc(s.productAssets.createdAt)),
    db.select({ i: s.lessonProgress.lessonIndex }).from(s.lessonProgress).where(and(eq(s.lessonProgress.userId, viewer.user.id), eq(s.lessonProgress.productId, p.id))),
  ]);
  const title = pick(lang, p.titleEn, p.titleKo);
  const lessons = p.lessons ?? [];
  const doneSet = new Set(progress.map((r) => r.i));
  const completed = lessons.filter((_, i) => doneSet.has(i)).length;
  const pct = lessons.length ? Math.round((completed / lessons.length) * 100) : 0;
  const nextLesson = lessons.findIndex((_, i) => !doneSet.has(i));
  const fileById = new Map(files.map((f) => [f.id, f]));
  const lessonAssetIds = new Set(lessons.map((l) => l.assetId).filter(Boolean));

  return (
    <>
      <AccountHeader
        crumbs={[{ href: "/account/library", label: t("Library", "라이브러리") }, { label: title }]}
        title={title}
        description={<>{seller.displayName} · {label(deliveryType, p.deliveryType, lang)} · {t(`Purchased ${formatDate(entitlement.createdAt, lang)}`, `${formatDate(entitlement.createdAt, lang)} 구매`)}</>}
        actions={<>
          <Link href={`/p/${p.slug}`} className="sf-btn sf-btn-outline sf-btn-sm"><ExternalLink aria-hidden />{t("Product page", "상품 페이지")}</Link>
          <Link href={`/account/inquiries/new?order=${entitlement.orderId}`} className="sf-btn sf-btn-outline sf-btn-sm"><MessageCircle aria-hidden />{t("Contact seller", "판매자 문의")}</Link>
        </>}
      />

      <div className="grid gap-5">
        {p.deliveryType === "course" && (
          <Card title={t("Your progress", "수강 진도")} id="progress">
            <div className="flex flex-wrap items-center gap-5">
              <img src={mediaUrl(p.coverKey)} alt="" className="sf-thumb sf-thumb-lg" />
              <div className="min-w-[220px] flex-1">
                <div className="mb-2 flex justify-between text-sm"><span>{t(`${completed} of ${n(lessons.length, "lesson")} complete`, `${lessons.length}개 중 ${completed}개 완료`)}</span><b>{pct}%</b></div>
                <div className="sf-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("Course progress", "수강 진도")}><i style={{ width: `${pct}%` }} /></div>
                <p className="!mt-2 text-[13px] text-[#6b7065]">{lessons.length === 0 ? t("The creator hasn’t published lessons yet.", "크리에이터가 아직 강의를 등록하지 않았습니다.") : nextLesson === -1 ? t("You’ve completed every lesson. Nice work!", "모든 강의를 완료했어요. 수고하셨습니다!") : t(`Up next: ${lessons[nextLesson].title}`, `다음 강의: ${lessons[nextLesson].title}`)}</p>
              </div>
            </div>
          </Card>
        )}

        {p.deliveryType === "course" && lessons.length > 0 && (
          <Card title={t("Lessons", "강의 목록")} id="lessons" pad={false}>
            <ol className="sf-list">
              {lessons.map((l, i) => {
                const asset = l.assetId ? fileById.get(l.assetId) : undefined;
                const isDone = doneSet.has(i);
                const playable = !!(l.videoUrl || l.body || (asset && /^(video|audio)\//.test(asset.contentType)));
                return (
                  <li key={i} className={i === nextLesson ? "bg-[#fffaf7]" : ""}>
                    <div className="sf-row">
                      <LessonToggle productId={p.id} index={i} done={isDone} title={l.title} />
                      <span className="w-6 text-sm text-[#9aa38c]" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                      <div className="min-w-0 flex-1">
                        <p className={`font-medium ${isDone ? "text-[#7a7e73] line-through decoration-[#c9ccc0]" : "text-[#20211f]"}`}>{l.title}</p>
                        <p className="flex flex-wrap items-center gap-2 text-[13px] text-[#6b7065]">
                          {l.minutes ? <span className="inline-flex items-center gap-1"><Clock size={13} aria-hidden />{t(`${l.minutes} min`, `${l.minutes}분`)}</span> : null}
                          {i === nextLesson && <span className="sf-pill sf-pill-brand">{t("Up next", "다음 강의")}</span>}
                          {!playable && !asset && <span className="text-[#9aa38c]">{t("No content yet", "콘텐츠 준비 중")}</span>}
                        </p>
                      </div>
                      {asset && <a href={`/api/download/asset/${asset.id}`} className="sf-btn sf-btn-outline sf-btn-sm" download><Download aria-hidden />{t("Lesson file", "강의 파일")}</a>}
                    </div>
                    {playable && (
                      <details className="sf-lesson" open={i === nextLesson}>
                        <summary>{t("Watch / read this lesson", "이 강의 보기")}</summary>
                        <LessonPlayer lesson={l} asset={asset} title={l.title} />
                      </details>
                    )}
                  </li>
                );
              })}
            </ol>
          </Card>
        )}

        <Card title={p.deliveryType === "course" ? t("Course files", "강의 자료") : t("Files", "파일")} id="files" pad={false}>
          {files.length ? (
            <ul className="sf-list">
              {files.map((f) => (
                <li key={f.id} className="sf-row">
                  <FileText size={18} className="text-[#7c8570]" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="break-all font-medium text-[#20211f]">{f.filename}</p>
                    <p className="text-[13px] text-[#6b7065]">{bytes(f.bytes)}{lessonAssetIds.has(f.id) ? ` · ${t("Lesson material", "강의 자료")}` : ""}</p>
                  </div>
                  <a href={`/api/download/asset/${f.id}`} className="sf-btn sf-btn-dark sf-btn-sm" download><Download aria-hidden />{t("Download", "다운로드")}</a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-5 text-sm text-[#6b7065]">{t("No files have been attached to this product yet.", "아직 이 상품에 첨부된 파일이 없습니다.")}</p>
          )}
        </Card>

        {pick(lang, p.descriptionEn, p.descriptionKo) && (
          <Card title={t("About", "소개")} id="about">
            <div className="sf-description !text-[15px]">{pick(lang, p.descriptionEn, p.descriptionKo)}</div>
          </Card>
        )}
      </div>
    </>
  );
}
