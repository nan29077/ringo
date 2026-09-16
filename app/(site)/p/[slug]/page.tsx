import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, CalendarClock, CheckCircle2, Clock, Download, FileText, Library, MessageCircle, Package, PlayCircle, RotateCcw, Star } from "lucide-react";
import * as s from "@/db/schema";
import { getViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { mediaUrl } from "@/lib/server/storage";
import { appOrigin } from "@/lib/server/request";
import { one, type SP } from "@/lib/server/list";
import { activeEntitlement, isPurchasable, listCatalog, pick, productBySlug, publicName, wishlistIds } from "@/lib/server/storefront";
import { bytes, formatDate, formatMoney } from "@/lib/i18n";
import { ProductCard } from "@/components/store/product-card";
import { WishlistButton } from "@/components/store/wishlist-button";
import { Stars } from "@/components/store/stars";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SP> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const db = await getDb();
  const row = await productBySlug(db, slug);
  if (!row || !isPurchasable(row)) return { title: "Product not found", robots: { index: false } };
  const { lang } = await getT();
  const p = row.product;
  const title = p.seoTitle || pick(lang, p.titleEn, p.titleKo);
  const description = (p.seoDescription || pick(lang, p.summaryEn, p.summaryKo) || pick(lang, p.descriptionEn, p.descriptionKo)).replace(/\s+/g, " ").slice(0, 160);
  const origin = await appOrigin();
  const image = new URL(mediaUrl(p.coverKey), origin).toString();
  return {
    title,
    description,
    alternates: { canonical: `${origin}/p/${p.slug}` },
    openGraph: { title, description, type: "website", url: `${origin}/p/${p.slug}`, images: [{ url: image, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

const COUPON_RE = /^[A-Z0-9_-]{2,40}$/;

export default async function ProductPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const db = await getDb();
  const [{ t, lang }, viewer, row] = await Promise.all([getT(), getViewer(), productBySlug(db, slug)]);
  if (!row) notFound();
  const { product: p, seller, category } = row;
  const purchasable = isPurchasable(row);
  const entitlement = viewer ? await activeEntitlement(db, viewer.user.id, p.id) : null;
  const service = p.deliveryType === "service";
  const owns = !!entitlement && !service;
  const linkState = one(sp, "link");
  const linkMessage =
    linkState === "expired" ? t("This selling link has expired.", "만료된 판매 링크입니다.")
    : linkState === "paused" ? t("This selling link has been paused by the seller.", "판매자가 일시 중지한 판매 링크입니다.")
    : linkState === "unavailable" ? t("This product is not available through that link right now.", "현재 해당 링크로는 이 상품을 구매할 수 없습니다.")
    : null;

  if (!purchasable && !entitlement) {
    if (!linkMessage) notFound();
    return (
      <main className="access shell">
        <AlertTriangle size={40} aria-hidden />
        <h1>{t("This product is unavailable", "구매할 수 없는 상품입니다")}</h1>
        <p>{linkMessage} {t("It may have been removed from sale.", "판매가 중단되었을 수 있습니다.")}</p>
        <Link href="/#catalog" className="sf-btn sf-btn-outline">{t("Browse other products", "다른 상품 둘러보기")}</Link>
      </main>
    );
  }

  const couponRaw = one(sp, "coupon").trim().toUpperCase();
  const coupon = COUPON_RE.test(couponRaw) ? couponRaw : "";
  const checkoutHref = `/checkout?product=${encodeURIComponent(p.slug)}${coupon ? `&coupon=${encodeURIComponent(coupon)}` : ""}`;
  const ownProduct = !!viewer?.seller && viewer.seller.id === p.sellerId;
  if (one(sp, "buy") === "1" && purchasable && !owns && !ownProduct && !linkMessage) {
    redirect(viewer ? checkoutHref : `/login?next=${encodeURIComponent(checkoutHref)}`);
  }

  const [settings, assetStats, reviews, [{ reviewCount }], more, saved] = await Promise.all([
    getSettings(db),
    db.select({ n: count(), size: sql<number>`coalesce(sum(${s.productAssets.bytes}),0)::bigint` }).from(s.productAssets).where(eq(s.productAssets.productId, p.id)),
    db
      .select({ id: s.productReviews.id, rating: s.productReviews.rating, body: s.productReviews.body, createdAt: s.productReviews.createdAt, name: s.users.name })
      .from(s.productReviews)
      .innerJoin(s.users, eq(s.users.id, s.productReviews.userId))
      .where(and(eq(s.productReviews.productId, p.id), eq(s.productReviews.hidden, false)))
      .orderBy(desc(s.productReviews.createdAt))
      .limit(20),
    db.select({ reviewCount: count() }).from(s.productReviews).where(and(eq(s.productReviews.productId, p.id), eq(s.productReviews.hidden, false))),
    listCatalog(db, { sellerId: seller.id, sort: "popular", limit: 3, excludeIds: [p.id] }),
    wishlistIds(db, viewer?.user.id),
  ]);
  const fileCount = assetStats[0]?.n ?? 0;
  const fileBytes = Number(assetStats[0]?.size ?? 0);

  const title = pick(lang, p.titleEn, p.titleKo);
  const summary = pick(lang, p.summaryEn, p.summaryKo);
  const description = pick(lang, p.descriptionEn, p.descriptionKo);
  const rating = p.ratingAvg != null ? p.ratingAvg / 10 : null;
  const onSale = p.compareAtCents != null && p.compareAtCents > p.priceCents;
  const lessons = p.lessons ?? [];
  const totalMinutes = lessons.reduce((a, l) => a + (l.minutes ?? 0), 0);
  const deliveryDays = p.deliveryDays ?? 7;
  const libraryHref = p.deliveryType === "course" ? `/account/library/${p.id}` : "/account/library";
  const initials = seller.displayName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <main className="shell sf-page">
      <Link href="/#catalog" className="mb-6 inline-flex items-center gap-2 text-sm text-[#6b7065] hover:text-[#20211f]"><ArrowLeft size={16} aria-hidden />{t("All digital goods", "전체 콘텐츠")}</Link>

      {linkMessage && <div className="sf-notice sf-notice-warn mb-6" role="alert"><AlertTriangle aria-hidden /><div><strong>{linkMessage}</strong> {t("You can still buy it at the regular price below.", "아래에서 일반 가격으로 구매할 수 있습니다.")}</div></div>}
      {!purchasable && entitlement && <div className="sf-notice sf-notice-info mb-6" role="status">{t("This product is no longer for sale, but you keep access from your library.", "더 이상 판매하지 않는 상품이지만, 라이브러리에서 계속 이용할 수 있습니다.")}</div>}

      <div className="sf-product-grid">
        <div className="sf-cover"><img src={mediaUrl(p.coverKey)} alt={title} fetchPriority="high" /></div>

        <div className="sf-buybox">
          <p className="sf-kicker">{lang === "ko" ? category.nameKo : category.nameEn}</p>
          <h1>{title}</h1>
          {rating != null && (
            <a href="#reviews" className="mb-4 flex items-center gap-2 text-sm text-[#4c5046] hover:underline">
              <Stars value={rating} label={t(`Rated ${rating.toFixed(1)} out of 5`, `5점 만점에 ${rating.toFixed(1)}점`)} />
              <b>{rating.toFixed(1)}</b>
              <span className="text-[#7a7e73]">{reviewCount > 0 ? t(`(${reviewCount} ${reviewCount === 1 ? "review" : "reviews"})`, `(리뷰 ${reviewCount}개)`) : ""}</span>
            </a>
          )}
          {summary && <p className="!mb-5 text-[16px] leading-relaxed text-[#55594f]">{summary}</p>}

          <Link href={`/s/${seller.slug}`} className="sf-seller-chip">
            {seller.avatarKey ? <img src={mediaUrl(seller.avatarKey)} alt="" className="sf-avatar" /> : <span className="sf-avatar" aria-hidden>{initials}</span>}
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-[#7a7e73]">{t("Created by", "크리에이터")}</span>
              <strong className="block truncate text-[15px] font-semibold text-[#20211f]">{seller.displayName}</strong>
            </span>
            <ArrowRight size={17} className="text-[#7a7e73]" aria-hidden />
          </Link>

          <div className="sf-price">
            <strong>{p.priceCents === 0 ? t("Free", "무료") : formatMoney(p.priceCents, p.currency, lang)}</strong>
            {onSale && <s>{formatMoney(p.compareAtCents, p.currency, lang)}</s>}
            {onSale && <span className="sf-save">-{Math.round((1 - p.priceCents / p.compareAtCents!) * 100)}%</span>}
            <span className="text-xs text-[#7a7e73]">{p.currency} · {service ? t("Per order", "주문 1건 기준") : t("One-time purchase", "1회 구매")}</span>
          </div>
          {coupon && purchasable && !owns && <p className="!-mt-2 !mb-4 text-sm text-[#1f6a3d]">{t(`Coupon ${coupon} will be applied at checkout if eligible.`, `쿠폰 ${coupon}은 조건 충족 시 결제 단계에서 적용됩니다.`)}</p>}

          <div className="grid gap-2.5">
            {owns ? (
              <Link href={libraryHref} className="sf-btn sf-btn-dark sf-btn-lg sf-btn-block"><Library aria-hidden />{t("In your library — open", "라이브러리에 있어요 · 열기")}</Link>
            ) : ownProduct ? (
              <Link href={`/seller/products/${p.id}`} className="sf-btn sf-btn-dark sf-btn-lg sf-btn-block">{t("This is your product — edit in seller center", "내 상품입니다 · 판매자 센터에서 관리")}</Link>
            ) : purchasable ? (
              <Link href={checkoutHref} className="sf-btn sf-btn-primary sf-btn-lg sf-btn-block">{service ? t("Order this service", "제작 서비스 주문하기") : p.priceCents === 0 ? t("Get it free", "무료로 받기") : t("Buy now", "바로 구매하기")}<ArrowRight aria-hidden /></Link>
            ) : (
              <span className="sf-btn sf-btn-outline sf-btn-lg sf-btn-block" aria-disabled="true">{t("Not available for purchase", "구매할 수 없는 상품")}</span>
            )}
            <div className="grid grid-cols-2 gap-2.5">
              <WishlistButton productId={p.id} saved={saved.has(p.id)} signedIn={!!viewer} next={`/p/${p.slug}`} className="sf-wish-inline" withLabel />
              <Link href={`/account/inquiries/new?product=${p.id}`} className="sf-wish-inline"><MessageCircle size={18} aria-hidden />{t("Ask the seller", "판매자에게 문의")}</Link>
            </div>
            {service && entitlement && <p className="text-center text-sm text-[#6b7065]">{t("You have ordered this service before.", "이전에 이 서비스를 주문한 적이 있어요.")} <Link href="/account/orders" className="sf-link">{t("View orders", "주문 내역 보기")}</Link></p>}
          </div>

          <ul className="sf-facts">
            {p.deliveryType === "download" && <li><Download aria-hidden />{t("Instant download after payment", "결제 후 바로 다운로드")}{fileCount > 0 && ` · ${t(`${fileCount} ${fileCount === 1 ? "file" : "files"}`, `파일 ${fileCount}개`)} (${bytes(fileBytes)})`}</li>}
            {p.deliveryType === "collection" && <li><Package aria-hidden />{t("Curated bundle — instant access after payment", "엄선한 패키지 · 결제 후 바로 이용")}{fileCount > 0 && ` · ${t(`${fileCount} ${fileCount === 1 ? "file" : "files"}`, `파일 ${fileCount}개`)}`}</li>}
            {p.deliveryType === "course" && <li><PlayCircle aria-hidden />{t(`${lessons.length} lessons`, `강의 ${lessons.length}개`)}{totalMinutes > 0 && ` · ${t(`${totalMinutes} min total`, `총 ${totalMinutes}분`)}`} · {t("learn at your own pace", "원하는 속도로 수강")}</li>}
            {service && <li><CalendarClock aria-hidden />{t(`Delivered within ${deliveryDays} days of payment`, `결제 후 ${deliveryDays}일 이내 납품`)}</li>}
            {service && <li><FileText aria-hidden />{t("You’ll describe your request (brief) at checkout", "결제 단계에서 제작 요청 내용을 작성합니다")}</li>}
            {p.formatLabel && <li><BookOpen aria-hidden />{p.formatLabel}</li>}
            <li><RotateCcw aria-hidden />{t(`Refund requests accepted within ${settings.commerce.refundWindowDays} days`, `${settings.commerce.refundWindowDays}일 이내 환불 요청 가능`)}</li>
          </ul>
        </div>
      </div>

      {description && (
        <section className="sf-section" aria-labelledby="about-title">
          <h2 id="about-title" className="sf-h2 !mb-4">{t("About this product", "상품 소개")}</h2>
          <div className="sf-description">{description}</div>
        </section>
      )}

      {p.deliveryType === "course" && lessons.length > 0 && (
        <section className="sf-section" aria-labelledby="outline-title">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2" style={{ maxWidth: 760 }}>
            <h2 id="outline-title" className="sf-h2">{t("Course outline", "커리큘럼")}</h2>
            <span className="text-sm text-[#6b7065]">{t(`${lessons.length} lessons`, `${lessons.length}개 강의`)}{totalMinutes > 0 && ` · ${t(`${totalMinutes} min`, `${totalMinutes}분`)}`}</span>
          </div>
          <ol className="sf-lessons">
            {lessons.map((l, i) => (
              <li key={i}>
                <span className="n">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1">{l.title}</span>
                {l.preview && <span className="sf-pill sf-pill-brand">{t("Preview", "미리보기")}</span>}
                {l.minutes ? <span className="flex items-center gap-1 text-sm text-[#7a7e73]"><Clock size={14} aria-hidden />{t(`${l.minutes} min`, `${l.minutes}분`)}</span> : null}
              </li>
            ))}
          </ol>
        </section>
      )}

      {service && (
        <section className="sf-section" aria-labelledby="how-title">
          <h2 id="how-title" className="sf-h2 !mb-4">{t("How this service works", "제작 서비스 진행 방식")}</h2>
          <ol className="grid max-w-[760px] gap-3 text-[15px] text-[#4f534a]">
            <li className="flex gap-3"><CheckCircle2 size={20} className="text-[#7c8570]" aria-hidden />{t("Place your order and share your brief — goals, audience, references.", "주문과 함께 목표, 대상 고객, 참고 자료 등 요청 내용을 전달하세요.")}</li>
            <li className="flex gap-3"><CheckCircle2 size={20} className="text-[#7c8570]" aria-hidden />{t("The creator starts production and keeps your order status updated.", "크리에이터가 제작을 시작하고 주문 상태를 업데이트합니다.")}</li>
            <li className="flex gap-3"><CheckCircle2 size={20} className="text-[#7c8570]" aria-hidden />{t(`Receive your files on the order page within ${deliveryDays} days. Questions? Message the seller any time.`, `${deliveryDays}일 이내에 주문 페이지에서 결과물을 받아보세요. 궁금한 점은 언제든 판매자에게 문의할 수 있습니다.`)}</li>
          </ol>
        </section>
      )}

      <section className="sf-section" id="reviews" aria-labelledby="reviews-title">
        <div className="mb-5 flex flex-wrap items-center gap-4">
          <h2 id="reviews-title" className="sf-h2">{t("Reviews", "리뷰")}</h2>
          {rating != null && <span className="flex items-center gap-2 text-sm"><Star size={16} fill="#c7902f" color="#c7902f" aria-hidden /><b>{rating.toFixed(1)}</b><span className="text-[#7a7e73]">/ 5{reviewCount > 0 && ` · ${t(`${reviewCount} ${reviewCount === 1 ? "review" : "reviews"}`, `리뷰 ${reviewCount}개`)}`}</span></span>}
        </div>
        {reviews.length ? (
          <div className="max-w-[760px]">
            {reviews.map((r) => (
              <article key={r.id} className="sf-review">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <Stars value={r.rating} size={14} label={t(`${r.rating} out of 5`, `5점 만점에 ${r.rating}점`)} />
                  <b className="text-[#20211f]">{publicName(r.name)}</b>
                  <span className="text-[#7a7e73]">{formatDate(r.createdAt, lang)}</span>
                  <span className="sf-pill sf-pill-green">{t("Verified purchase", "구매 인증")}</span>
                </div>
                {r.body && <p className="!mt-2 whitespace-pre-line text-[15px] leading-relaxed text-[#4f534a]">{r.body}</p>}
              </article>
            ))}
          </div>
        ) : (
          <p className="text-[15px] text-[#6b7065]">{t("No written reviews yet. Buyers can review after their purchase.", "아직 작성된 리뷰가 없습니다. 구매자는 구매 후 리뷰를 남길 수 있어요.")}</p>
        )}
      </section>

      {more.rows.length > 0 && (
        <section className="sf-section ringo-home" aria-labelledby="more-title">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <h2 id="more-title" className="sf-h2">{t(`More from ${seller.displayName}`, `${seller.displayName}의 다른 상품`)}</h2>
            <Link href={`/s/${seller.slug}`} className="sf-link text-sm">{t("Visit store", "스토어 방문")}</Link>
          </div>
          <div className="product-grid">
            {more.rows.map((m) => <ProductCard key={m.id} p={m} lang={lang} t={t} saved={saved.has(m.id)} signedIn={!!viewer} />)}
          </div>
        </section>
      )}
    </main>
  );
}
