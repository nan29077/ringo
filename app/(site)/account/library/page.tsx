import Link from "next/link";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { BookOpen, Download, FileText, MessageCircle, PlayCircle } from "lucide-react";
import * as s from "@/db/schema";
import { requireViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { mediaUrl } from "@/lib/server/storage";
import { one, type SP } from "@/lib/server/list";
import { pick } from "@/lib/server/storefront";
import { bytes, formatDate, n } from "@/lib/i18n";
import { deliveryType, fulfillmentStatus, label } from "@/lib/status";
import { StatusBadge } from "@/components/console/status-badge";
import { AccountHeader, Empty } from "@/components/store/account-ui";

export const metadata = { title: "Library" };

const TYPES = ["download", "course", "service", "collection"] as const;

export default async function LibraryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const viewer = await requireViewer("/account/library");
  const sp = await searchParams;
  const { t, lang } = await getT();
  const db = await getDb();
  const typeParam = one(sp, "type");
  const type = (TYPES as readonly string[]).includes(typeParam) ? (typeParam as s.DeliveryType) : null;

  const items = await db
    .select({ entitlement: s.entitlements, product: s.products, sellerName: s.sellers.displayName, order: s.orders })
    .from(s.entitlements)
    .innerJoin(s.products, eq(s.products.id, s.entitlements.productId))
    .innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId))
    .innerJoin(s.orders, eq(s.orders.id, s.entitlements.orderId))
    .where(and(eq(s.entitlements.userId, viewer.user.id), eq(s.entitlements.status, "active"), type ? eq(s.products.deliveryType, type) : undefined))
    .orderBy(desc(s.entitlements.createdAt));

  const productIds = [...new Set(items.map((i) => i.product.id))];
  const serviceOrderIds = items.filter((i) => i.product.deliveryType === "service" && i.order.fulfillmentStatus === "delivered").map((i) => i.order.id);
  const [assets, deliverables, progress, typeCounts] = await Promise.all([
    productIds.length ? db.select().from(s.productAssets).where(inArray(s.productAssets.productId, productIds)).orderBy(asc(s.productAssets.sort), asc(s.productAssets.createdAt)) : [],
    serviceOrderIds.length ? db.select().from(s.orderDeliverables).where(inArray(s.orderDeliverables.orderId, serviceOrderIds)).orderBy(asc(s.orderDeliverables.createdAt)) : [],
    productIds.length ? db.select({ productId: s.lessonProgress.productId, n: count() }).from(s.lessonProgress).where(and(eq(s.lessonProgress.userId, viewer.user.id), inArray(s.lessonProgress.productId, productIds))).groupBy(s.lessonProgress.productId) : [],
    db.select({ type: s.products.deliveryType, n: count() }).from(s.entitlements).innerJoin(s.products, eq(s.products.id, s.entitlements.productId)).where(and(eq(s.entitlements.userId, viewer.user.id), eq(s.entitlements.status, "active"))).groupBy(s.products.deliveryType),
  ]);
  const done = new Map(progress.map((p) => [p.productId, p.n]));
  const counts = new Map(typeCounts.map((c) => [c.type, c.n]));
  const total = typeCounts.reduce((a, c) => a + c.n, 0);

  return (
    <>
      <AccountHeader title={t("Your library", "라이브러리")} description={t("Everything you’ve bought — download files, continue courses and track services.", "구매한 모든 콘텐츠 · 파일 다운로드, 강의 이어보기, 제작 서비스 진행 확인.")} />
      {total > 0 && (
        <nav className="sf-tabs" aria-label={t("Filter by type", "유형별 보기")}>
          <Link href="/account/library" className={!type ? "active" : ""} aria-current={!type ? "true" : undefined}>{t("All", "전체")} {total}</Link>
          {TYPES.filter((ty) => counts.get(ty)).map((ty) => (
            <Link key={ty} href={`/account/library?type=${ty}`} className={type === ty ? "active" : ""} aria-current={type === ty ? "true" : undefined}>{label(deliveryType, ty, lang)} {counts.get(ty)}</Link>
          ))}
        </nav>
      )}

      {items.length === 0 ? (
        <div className="sf-card">
          <Empty icon={BookOpen} title={type ? t("Nothing of this type yet", "해당 유형의 콘텐츠가 없어요") : t("Your library is empty", "라이브러리가 비어 있어요")} body={t("When you buy a product, it appears here right after payment.", "상품을 구매하면 결제 직후 이곳에 표시됩니다.")} action={<Link href="/#catalog" className="sf-btn sf-btn-primary sf-btn-sm">{t("Browse products", "상품 둘러보기")}</Link>} />
        </div>
      ) : (
        <ul className="grid gap-4">
          {items.map(({ entitlement, product: p, sellerName, order }) => {
            const files = assets.filter((a) => a.productId === p.id);
            const title = pick(lang, p.titleEn, p.titleKo);
            const lessons = p.lessons?.length ?? 0;
            const completed = Math.min(done.get(p.id) ?? 0, lessons);
            const pct = lessons ? Math.round((completed / lessons) * 100) : 0;
            const delivered = deliverables.filter((d) => d.orderId === order.id);
            return (
              <li key={entitlement.id} className="sf-card sf-card-pad">
                <div className="flex flex-wrap items-start gap-4">
                  <img src={mediaUrl(p.coverKey)} alt="" className="sf-thumb sf-thumb-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="sf-pill">{label(deliveryType, p.deliveryType, lang)}</span>
                      {p.deliveryType === "service" && <StatusBadge map={fulfillmentStatus} value={order.fulfillmentStatus} lang={lang} />}
                    </div>
                    <h2 className="!mt-2 text-[18px] font-semibold text-[#20211f]">{title}</h2>
                    <p className="text-[13px] text-[#6b7065]">{sellerName} · {t(`Purchased ${formatDate(entitlement.createdAt, lang)}`, `${formatDate(entitlement.createdAt, lang)} 구매`)}{p.formatLabel ? ` · ${p.formatLabel}` : ""}</p>

                    {p.deliveryType === "course" && lessons > 0 && (
                      <div className="mt-3 max-w-md">
                        <div className="mb-1.5 flex justify-between text-[13px] text-[#4c5046]"><span>{t(`${completed} of ${n(lessons, "lesson")} complete`, `${lessons}개 중 ${completed}개 완료`)}</span><span>{pct}%</span></div>
                        <div className="sf-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("Course progress", "수강 진도")}><i style={{ width: `${pct}%` }} /></div>
                      </div>
                    )}

                    {p.deliveryType === "service" && (
                      <p className="!mt-2 text-[13px] text-[#4c5046]">
                        {order.fulfillmentStatus === "delivered"
                          ? t(`Delivered ${formatDate(order.deliveredAt, lang)}`, `${formatDate(order.deliveredAt, lang)} 납품 완료`)
                          : order.dueAt ? t(`Expected by ${formatDate(order.dueAt, lang)}`, `${formatDate(order.dueAt, lang)}까지 납품 예정`) : null}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {p.deliveryType === "course" && <Link href={`/account/library/${p.id}`} className="sf-btn sf-btn-primary sf-btn-sm"><PlayCircle aria-hidden />{completed > 0 ? t("Continue course", "이어서 수강") : t("Open course", "강의 시작")}</Link>}
                    {p.deliveryType !== "course" && p.deliveryType !== "service" && <Link href={`/account/library/${p.id}`} className="sf-btn sf-btn-outline sf-btn-sm">{t("Details", "상세")}</Link>}
                    {p.deliveryType === "service" && <Link href={`/account/orders/${order.id}`} className="sf-btn sf-btn-outline sf-btn-sm">{t("View order", "주문 보기")}</Link>}
                  </div>
                </div>

                {p.deliveryType !== "service" && p.deliveryType !== "course" && (
                  <div className="mt-4 border-t border-[#efefeb] pt-4">
                    {files.length ? (
                      <ul className="grid gap-2">
                        {files.map((f) => (
                          <li key={f.id} className="flex flex-wrap items-center gap-3 text-sm">
                            <FileText size={17} className="text-[#7c8570]" aria-hidden />
                            <span className="min-w-0 flex-1 break-all text-[#20211f]">{f.filename} <span className="text-[#7a7e73]">· {bytes(f.bytes)}</span></span>
                            <a href={`/api/download/asset/${f.id}`} className="sf-btn sf-btn-dark sf-btn-sm" download><Download aria-hidden />{t("Download", "다운로드")}</a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="flex flex-wrap items-center gap-2 text-sm text-[#6b7065]">{t("The seller hasn’t attached files yet.", "판매자가 아직 파일을 등록하지 않았습니다.")} <Link href={`/account/inquiries/new?order=${order.id}`} className="sf-link inline-flex items-center gap-1"><MessageCircle size={14} aria-hidden />{t("Contact seller", "판매자에게 문의")}</Link></p>
                    )}
                  </div>
                )}

                {p.deliveryType === "service" && delivered.length > 0 && (
                  <ul className="mt-4 grid gap-2 border-t border-[#efefeb] pt-4">
                    {delivered.map((f) => (
                      <li key={f.id} className="flex flex-wrap items-center gap-3 text-sm">
                        <FileText size={17} className="text-[#7c8570]" aria-hidden />
                        <span className="min-w-0 flex-1 break-all">{f.filename} <span className="text-[#7a7e73]">· {bytes(f.bytes)}</span></span>
                        <a href={`/api/download/deliverable/${f.id}`} className="sf-btn sf-btn-dark sf-btn-sm" download><Download aria-hidden />{t("Download", "다운로드")}</a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
