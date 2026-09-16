import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { CheckCircle2, FileText } from "lucide-react";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { mediaUrl } from "@/lib/server/storage";
import { formatDate, formatMoney } from "@/lib/i18n";
import { deliveryType } from "@/lib/status";
import { PageHeader, Panel, EmptyState, Badge, Notice } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionButton, ActionForm } from "@/components/common/action-form";
import { approveProduct, rejectProduct } from "../actions";

export const metadata = { title: "Review queue" };

export default async function AdminReviewQueue() {
  await requireAdmin();
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const files = db
    .select({ productId: s.productAssets.productId, n: sql<number>`count(*)::int`.as("n") })
    .from(s.productAssets)
    .groupBy(s.productAssets.productId)
    .as("files");
  const rows = await db
    .select({ p: s.products, seller: s.sellers.displayName, sellerStatus: s.sellers.status, categoryEn: s.categories.nameEn, categoryKo: s.categories.nameKo, files: sql<number>`coalesce(${files.n},0)::int` })
    .from(s.products)
    .innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId))
    .innerJoin(s.categories, eq(s.categories.id, s.products.categoryId))
    .leftJoin(files, eq(files.productId, s.products.id))
    .where(eq(s.products.status, "pending_review"))
    .orderBy(asc(sql`coalesce(${s.products.submittedAt}, ${s.products.createdAt})`))
    .limit(100);
  const now = Date.now();

  return (
    <>
      <PageHeader
        title={t("Product review queue", "상품 심사")}
        description={t("Products submitted by sellers, oldest first. Approving publishes immediately; rejection reasons are emailed to the seller.", "판매자가 심사를 요청한 상품입니다 (오래된 순). 승인 시 즉시 판매되며 반려 사유는 판매자에게 메일로 전달됩니다.")}
        crumbs={[{ href: "/admin/products", label: t("Products", "상품 관리") }, { label: t("Review queue", "상품 심사") }]}
      />
      {rows.length === 0 ? (
        <Panel>
          <EmptyState title={t("The review queue is empty", "심사 대기 중인 상품이 없습니다")} description={t("New submissions will appear here.", "새 심사 요청이 들어오면 여기에 표시됩니다.")} action={<Link href="/admin/products" className="rc-btn rc-btn-outline rc-btn-sm">{t("Product list", "상품 목록")}</Link>} />
        </Panel>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-[#6b6e78]">{t(`${rows.length} products waiting`, `심사 대기 ${rows.length}건`)}</p>
          {rows.map(({ p, seller, sellerStatus, categoryEn, categoryKo, files: fileCount }) => {
            const submitted = p.submittedAt ?? p.createdAt;
            const waitingDays = Math.floor((now - submitted.getTime()) / 86400000);
            const needsFiles = p.deliveryType === "download" || p.deliveryType === "collection";
            return (
              <section key={p.id} className="rc-panel">
                <div className="grid gap-5 p-5 lg:grid-cols-[1fr_300px]">
                  <div className="flex min-w-0 gap-4">
                    <img src={mediaUrl(p.coverKey)} alt="" className="h-24 w-24 shrink-0 rounded-xl border border-[#e9ebef] object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge map={deliveryType} value={p.deliveryType} lang={lang} />
                        <span className="text-xs text-[#8a8d96]">{lang === "ko" ? categoryKo : categoryEn}</span>
                        <Badge tone={waitingDays >= 3 ? "red" : waitingDays >= 1 ? "amber" : "gray"}>{t(`Waiting ${waitingDays}d`, `대기 ${waitingDays}일`)}</Badge>
                        {sellerStatus !== "active" && <Badge tone="red">{t("Seller not active", "판매자 비활성")}</Badge>}
                      </div>
                      <Link href={`/admin/products/${p.id}`} className="mt-1.5 block text-base font-bold text-[#16171b] hover:underline">{p.titleKo}</Link>
                      <div className="text-sm text-[#5b5e68]">{p.titleEn}</div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6b6e78]">
                        <span>{t("Seller", "판매자")}: <Link href={`/admin/sellers/${p.sellerId}`} className="font-semibold text-[#2f4ac2] hover:underline">{seller}</Link></span>
                        <span>{t("Price", "판매가")}: <b className="text-[#1c1d22]">{formatMoney(p.priceCents, p.currency, lang)}</b></span>
                        <span className="inline-flex items-center gap-1"><FileText className="size-3.5" />{t(`${fileCount} files`, `파일 ${fileCount}개`)}</span>
                        {p.deliveryType === "course" && <span>{t(`${p.lessons.length} lessons`, `강의 ${p.lessons.length}개`)}</span>}
                        {p.deliveryType === "service" && <span>{t(`${p.deliveryDays ?? 7}-day delivery`, `제작 ${p.deliveryDays ?? 7}일`)}</span>}
                        <span>{t("Submitted", "요청일")}: {formatDate(submitted, lang, true)}</span>
                      </div>
                      {(p.summaryKo || p.summaryEn) && <p className="mt-3 text-sm font-medium text-[#3b3d46]">{lang === "ko" ? p.summaryKo || p.summaryEn : p.summaryEn || p.summaryKo}</p>}
                      <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[13px] leading-relaxed text-[#5b5e68]">{(lang === "ko" ? p.descriptionKo || p.descriptionEn : p.descriptionEn || p.descriptionKo) || t("(no description)", "(상세 설명 없음)")}</p>
                    </div>
                  </div>
                  <div className="grid content-start gap-2 border-t border-[#eef0f3] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                    {needsFiles && fileCount === 0 && <Notice tone="warn">{t("No downloadable files attached.", "다운로드 파일이 없습니다.")}</Notice>}
                    <ActionButton action={approveProduct.bind(null, p.id)} variant="default" size="default" className="w-full"><CheckCircle2 />{t("Approve & publish", "승인 (판매 시작)")}</ActionButton>
                    <ActionForm action={rejectProduct} className="grid gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <textarea name="reason" required maxLength={1000} aria-label={t("Rejection reason", "반려 사유")} className="rc-textarea !min-h-[64px]" placeholder={t("Rejection reason (sent to the seller)", "반려 사유 (판매자에게 전달)")} />
                      <button className="rc-btn rc-btn-danger w-full">{t("Reject", "반려")}</button>
                    </ActionForm>
                    <Link href={`/admin/products/${p.id}`} className="rc-btn rc-btn-outline w-full">{t("Open full details", "상세 보기")}</Link>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
