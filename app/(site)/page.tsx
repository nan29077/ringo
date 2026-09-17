import Link from "next/link";
import type { Metadata } from "next";
import { ArrowUpRight, BookOpen, Camera, Check, Download, Heart, LayoutGrid, Link2, Megaphone, Package, Palette, Search, ShieldCheck, ShoppingBag, Sparkles } from "lucide-react";
import { getViewer } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { mediaUrl } from "@/lib/server/storage";
import { one, type SP } from "@/lib/server/list";
import { activeBanners, activeCategories, categoryCounts, highlightedSellers, listCatalog, pick, wishlistIds } from "@/lib/server/storefront";
import { formatMoney } from "@/lib/i18n";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HeroCarousel, type HeroSlide } from "@/components/store/hero-carousel";
import { ProductCard } from "@/components/store/product-card";
import { SortSelect } from "@/components/store/sort-select";

export const metadata: Metadata = {
  title: { absolute: "Ringo — Digital goods by independent creators" },
  description: "Discover eBooks, courses, design resources, photography presets and creative services from independent creators on Ringo.",
  openGraph: { title: "Ringo — Digital goods by independent creators", images: ["/images/banner-books-v2.webp"] },
};

const PAGE_SIZE = 24;

const categoryStyle: Record<string, { icon: typeof BookOpen; style: string; en: string; ko: string }> = {
  courses: { icon: BookOpen, style: "cyan", en: "Learn something new.", ko: "새로운 배움을 시작하기." },
  advertising: { icon: Megaphone, style: "coral", en: "Bring ideas to life.", ko: "아이디어를 세상으로." },
  collections: { icon: Package, style: "lilac", en: "Better together.", ko: "함께라서 더 좋은 콘텐츠." },
  digital: { icon: Download, style: "cyan", en: "Make every day easier.", ko: "매일 조금 더 편리하게." },
  ebooks: { icon: BookOpen, style: "coral", en: "Read. Learn. Grow.", ko: "읽고, 배우고, 성장하기." },
  design: { icon: Palette, style: "lilac", en: "Make your mark.", ko: "나만의 색을 더하기." },
  photo: { icon: Camera, style: "cyan", en: "Capture a feeling.", ko: "순간의 감성을 담기." },
};
const monogramTheme = ["ink", "orange", "blue"];

function catalogHref(params: { q?: string; category?: string; sort?: string; page?: number }) {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.category) sp.set("category", params.category);
  if (params.sort && params.sort !== "featured") sp.set("sort", params.sort);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return `/${qs ? `?${qs}` : ""}#catalog`;
}

export default async function Home({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { t, lang } = await getT();
  const viewer = await getViewer();
  const db = await getDb();
  const q = one(sp, "q").trim().slice(0, 80);
  const categoryParam = one(sp, "category");
  const page = Math.max(1, Number(one(sp, "page")) || 1);
  const [categories, counts, banners, sellers, settings] = await Promise.all([activeCategories(db), categoryCounts(db), activeBanners(db), highlightedSellers(db, 3), getSettings(db)]);
  const category = categories.some((c) => c.id === categoryParam) ? categoryParam : "";
  const filtering = !!(q || category || page > 1);
  const [catalog, featured] = await Promise.all([
    listCatalog(db, { q, category, sort: one(sp, "sort"), limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    filtering ? Promise.resolve(null) : listCatalog(db, { featured: true, sort: "featured", limit: 4 }),
  ]);
  const allIds = [...catalog.rows, ...(featured?.rows ?? [])].map((p) => p.id);
  const saved = await wishlistIds(db, viewer?.user.id, allIds);
  const totalAll = [...counts.values()].reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil(catalog.total / PAGE_SIZE));
  const spotlight = featured?.rows[0];
  const picks = featured?.rows.slice(1) ?? [];

  const slides: HeroSlide[] = banners.length
    ? banners.map((b) => ({ id: b.id, title: pick(lang, b.titleEn, b.titleKo), subtitle: pick(lang, b.subtitleEn, b.subtitleKo) || null, cta: pick(lang, b.ctaEn, b.ctaKo) || null, image: mediaUrl(b.imageKey), href: b.linkUrl }))
    : [{ id: "default", title: t("Small downloads. Big possibilities.", "작은 콘텐츠, / 더 큰 가능성."), subtitle: t("eBooks, courses, design resources and creative services from independent creators.", "독립 크리에이터의 전자책, 강의, 디자인 리소스와 제작 서비스를 만나보세요."), cta: t("Browse the catalog", "전체 상품 보기"), image: "/images/banner-books-v2.webp", href: "/#catalog" }];

  const signedIn = !!viewer;
  const refundDays = settings.commerce.refundWindowDays;

  return (
    <main className="ringo-home">
      {one(sp, "link") === "invalid" && (
        <div className="rh-shell pt-5"><div className="sf-notice sf-notice-warn" role="status">{t("That link is not valid. Browse the catalog below instead.", "유효하지 않은 링크입니다. 아래 전체 상품을 둘러보세요.")}</div></div>
      )}
      {one(sp, "link") === "unavailable" && (
        <div className="rh-shell pt-5"><div className="sf-notice sf-notice-warn" role="status">{t("The product behind that link is not on sale right now. Browse the catalog below instead.", "해당 링크의 상품은 현재 판매하지 않습니다. 아래 전체 상품을 둘러보세요.")}</div></div>
      )}
      <HeroCarousel slides={slides} />

      <div className="rh-promise">
        <div className="rh-shell">
          <span><Download size={17} aria-hidden />{t("Instant access after payment.", "결제 후 바로 이용할 수 있어요.")}</span><i />
          <span><Heart size={17} aria-hidden />{t("Original work from independent creators.", "독립 크리에이터의 오리지널 콘텐츠.")}</span><i />
          <span><ShieldCheck size={17} aria-hidden />{t(`Refund requests within ${refundDays} days.`, `${refundDays}일 이내 환불 요청 가능.`)}</span>
        </div>
      </div>

      {categories.length > 0 && (
        <section className="rh-explore rh-shell" aria-labelledby="explore-title">
          <div className="rh-section-top">
            <p className="rh-kicker" id="explore-title">{t("FOLLOW YOUR CURIOSITY", "당신의 호기심을 따라")}</p>
            <p>{t("What will you make next?", "다음에는 무엇을 만들어 볼까요?")}</p>
          </div>
          <div className="rh-categories">
            {categories.map((c) => {
              const st = categoryStyle[c.id] ?? { icon: LayoutGrid, style: "cyan", en: c.nameEn, ko: c.nameKo };
              const Icon = st.icon;
              return (
                <Link className={`rh-category ${st.style}`} key={c.id} href={catalogHref({ category: c.id })}>
                  <span className="rh-category-icon"><Icon size={25} strokeWidth={1.4} aria-hidden /></span>
                  <span><strong>{t(st.en, st.ko)}</strong><small>{lang === "ko" ? c.nameKo : c.nameEn} · {counts.get(c.id) ?? 0}</small></span>
                  <ArrowUpRight size={22} aria-hidden />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {picks.length > 0 && (
        <section className="rh-catalog rh-shell" aria-labelledby="picks-title">
          <div className="rh-section-heading">
            <div><p className="rh-kicker">{t("RINGO PICKS", "링고 추천")}</p><h2 id="picks-title">{t("Featured this week.", "이번 주 추천 콘텐츠.")}</h2></div>
            <p>{t("Hand-picked by the Ringo team from the current catalog.", "링고 팀이 현재 판매 중인 상품 중에서 골랐어요.")}</p>
          </div>
          <div className="product-grid">
            {picks.map((p, i) => <ProductCard key={p.id} p={p} lang={lang} t={t} saved={saved.has(p.id)} signedIn={signedIn} tag={t("RINGO PICK", "링고 추천")} priority={i < 3} />)}
          </div>
        </section>
      )}

      <section id="catalog" className="rh-catalog rh-shell" aria-labelledby="catalog-title">
        <div className="rh-section-heading">
          <div><p className="rh-kicker">{t("GOOD FINDS, ALL IN ONE PLACE", "좋은 발견을 한곳에")}</p><h2 id="catalog-title">{t("Your next favorite is here.", "마음에 드는 다음 콘텐츠.")}</h2></div>
          <p>{t("Thoughtfully made. Ready to make it yours.", "정성스럽게 만든 콘텐츠, 당신의 시작을 기다립니다.")}</p>
        </div>
        <div className="rh-catalog-toolbar">
          <nav className="rh-filter-tabs" aria-label={t("Categories", "카테고리")}>
            <Link href={catalogHref({ q, sort: catalog.sort })} className={!category ? "selected" : ""} aria-current={!category ? "page" : undefined}>{t("All", "전체")}<span>{totalAll}</span></Link>
            {categories.map((c) => (
              <Link key={c.id} href={catalogHref({ q, category: c.id, sort: catalog.sort })} className={category === c.id ? "selected" : ""} aria-current={category === c.id ? "page" : undefined}>{lang === "ko" ? c.nameKo : c.nameEn}</Link>
            ))}
          </nav>
          <form action="/" method="get" className="rh-search" role="search">
            {category && <input type="hidden" name="category" value={category} />}
            {catalog.sort !== "featured" && <input type="hidden" name="sort" value={catalog.sort} />}
            <Search size={17} aria-hidden />
            <input name="q" type="search" defaultValue={q} placeholder={t("Search products or creators…", "상품 또는 크리에이터 검색…")} aria-label={t("Search digital goods", "디지털 콘텐츠 검색")} className="sf-search-input" maxLength={80} />
          </form>
        </div>
        <div className="rh-results">
          <span aria-live="polite">
            {q ? t(`${catalog.total} results for “${q}”`, `“${q}” 검색 결과 ${catalog.total}개`) : t(`${catalog.total} digital goods`, `디지털 콘텐츠 ${catalog.total}개`)}
            {(q || category) && <Link href="/#catalog" className="ml-3 underline underline-offset-2">{t("Clear filters", "필터 초기화")}</Link>}
          </span>
          <SortSelect value={catalog.sort} />
        </div>
        {catalog.rows.length > 0 ? (
          <div className="product-grid">
            {catalog.rows.map((p) => <ProductCard key={p.id} p={p} lang={lang} t={t} saved={saved.has(p.id)} signedIn={signedIn} />)}
          </div>
        ) : (
          <div className="rh-empty">
            <Search size={32} aria-hidden />
            <h3>{t("Let’s try a different idea.", "다른 콘텐츠를 찾아볼까요?")}</h3>
            <p>{t("No digital goods match these filters.", "현재 조건에 맞는 콘텐츠가 없습니다.")}</p>
            <Link href="/#catalog" className="sf-btn sf-btn-outline">{t("Clear filters", "검색 조건 초기화")}</Link>
          </div>
        )}
        {pages > 1 && (
          <nav className="sf-pager" aria-label={t("Pagination", "페이지")}>
            {page > 1 ? <Link href={catalogHref({ q, category, sort: catalog.sort, page: page - 1 })} className="sf-btn sf-btn-outline">{t("Previous", "이전")}</Link> : <span />}
            <span>{t(`Page ${page} of ${pages}`, `${pages}페이지 중 ${page}페이지`)}</span>
            {page < pages ? <Link href={catalogHref({ q, category, sort: catalog.sort, page: page + 1 })} className="sf-btn sf-btn-outline">{t("Next", "다음")}</Link> : <span />}
          </nav>
        )}
      </section>

      {spotlight && (
        <section id="ringo-edit" className="rh-editorial rh-shell" aria-labelledby="spotlight-title">
          <div className="rh-editorial-inner">
            <Link className="rh-editorial-image" href={`/p/${spotlight.slug}`} aria-label={pick(lang, spotlight.titleEn, spotlight.titleKo)}>
              <img src={mediaUrl(spotlight.coverKey)} alt="" loading="lazy" />
              <span>{(lang === "ko" ? spotlight.categoryKo : spotlight.categoryEn).toUpperCase()}<ArrowUpRight size={20} aria-hidden /></span>
            </Link>
            <div className="rh-editorial-copy">
              <p className="rh-kicker"><Sparkles size={15} aria-hidden />{t("IN THE SPOTLIGHT", "에디터가 주목한 콘텐츠")}</p>
              <h2 id="spotlight-title">{pick(lang, spotlight.titleEn, spotlight.titleKo)}</h2>
              {pick(lang, spotlight.summaryEn, spotlight.summaryKo) && <p>{pick(lang, spotlight.summaryEn, spotlight.summaryKo)}</p>}
              <ul>
                {spotlight.formatLabel && <li><Check size={17} aria-hidden />{spotlight.formatLabel}</li>}
                <li><Check size={17} aria-hidden />{spotlight.deliveryType === "service" ? t(`Made for you in ${spotlight.deliveryDays ?? 7} days`, `${spotlight.deliveryDays ?? 7}일 내 맞춤 제작`) : spotlight.deliveryType === "course" ? t("Watch at your own pace", "원하는 속도로 수강") : t("Instant download after payment", "결제 후 바로 다운로드")}</li>
                <li><Check size={17} aria-hidden />{t(`Created by ${spotlight.sellerName}`, `${spotlight.sellerName} 제작`)}</li>
              </ul>
              <div className="rh-editorial-cta">
                <Link href={`/p/${spotlight.slug}`} className="sf-spot-btn">{t("View details", "자세히 보기")}<ArrowUpRight size={18} aria-hidden /></Link>
                <span>{formatMoney(spotlight.priceCents, spotlight.currency, lang)} <small>{spotlight.currency}</small></span>
              </div>
            </div>
          </div>
        </section>
      )}

      {sellers.length > 0 && (
        <section className="rh-creators rh-shell" id="creators" aria-labelledby="creators-title">
          <div className="rh-section-heading">
            <div><p className="rh-kicker">{t("BEHIND EVERY GOOD FIND", "좋은 콘텐츠 뒤에는")}</p><h2 id="creators-title">{t("Real ideas. Independent minds.", "아이디어를 만드는 사람들.")}</h2></div>
            <p>{t("Meet the creators selling on Ringo.", "링고에서 판매 중인 크리에이터를 만나보세요.")}</p>
          </div>
          <div className="rh-creator-grid">
            {sellers.map((c, i) => (
              <article className="rh-creator" key={c.id}>
                <div className="rh-creator-top">
                  {c.avatarKey ? <img src={mediaUrl(c.avatarKey)} alt="" className="rh-studio-monogram object-cover" /> : <span className={`rh-studio-monogram ${monogramTheme[i % 3]}`} aria-hidden>{c.displayName.split(/\s+/).map((w) => w[0]).join("").slice(0, 3)}</span>}
                </div>
                <h3>{c.displayName}</h3>
                {c.bio && <p>{c.bio}</p>}
                <div className="rh-creator-bottom">
                  <span>{t(`${c.products} ${c.products === 1 ? "product" : "products"}`, `상품 ${c.products}개`)}</span>
                  <Link href={`/s/${c.slug}`} aria-label={t(`Visit ${c.displayName}`, `${c.displayName} 스토어 보기`)}><ArrowUpRight size={21} aria-hidden /></Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="rh-how rh-shell" aria-labelledby="how-title">
        <div className="rh-how-intro">
          <p className="rh-kicker">{t("FROM FOUND TO YOURS", "발견부터 나의 콘텐츠가 되기까지")}</p>
          <h2 id="how-title">{t("A few clicks.", "몇 번의 클릭.")}<br /><em>{t("A fresh start.", "새로운 시작.")}</em></h2>
          <p>{t("How buying on Ringo works.", "링고에서 구매하는 방법.")}</p>
        </div>
        <div className="rh-steps">
          {[
            { n: "01", icon: Search, title: t("Find your spark", "영감을 발견하세요"), text: t("Browse categories, explore a creator’s store, or search for your next idea.", "카테고리를 둘러보거나 크리에이터 스토어를 방문하고, 다음 아이디어를 검색하세요.") },
            { n: "02", icon: ShoppingBag, title: t("Make it yours", "마음에 드는 콘텐츠를 선택하세요"), text: t("Check the details and reviews, apply a coupon if you have one, and pay securely.", "상세 정보와 리뷰를 확인하고, 쿠폰이 있다면 적용한 뒤 안전하게 결제하세요.") },
            { n: "03", icon: Download, title: t("Let’s make something", "이제, 시작해 볼까요"), text: t("Downloads and courses open in your library right away. Services are delivered to your order page.", "다운로드와 강의는 바로 라이브러리에서 열리고, 제작 서비스는 주문 페이지로 납품됩니다.") },
          ].map((s) => (
            <div className="rh-step" key={s.n}><div><span>{s.n}</span><s.icon size={20} strokeWidth={1.4} aria-hidden /></div><h3>{s.title}</h3><p>{s.text}</p></div>
          ))}
        </div>
      </section>

      <section className="rh-faq rh-shell" aria-labelledby="faq-title">
        <div>
          <p className="rh-kicker">{t("A FEW GOOD ANSWERS", "궁금한 점을 모았어요")}</p>
          <h2 id="faq-title">{t("Curious about Ringo?", "링고가 더 궁금한가요?")}</h2>
          <p>{t("A little clarity before your next discovery.", "새로운 발견을 시작하기 전, 알아두면 좋은 이야기.")}</p>
        </div>
        <Accordion type="single" collapsible className="rh-faq-list">
          {[
            { q: t("What can I find on Ringo?", "링고에서는 어떤 콘텐츠를 만날 수 있나요?"), a: t("eBooks and practical guides, online courses, editable design resources, photography presets, curated collections and made-to-order creative services — all from independent creators.", "전자책과 실용 가이드, 온라인 강의, 편집 가능한 디자인 리소스, 사진 프리셋, 기획전 패키지, 맞춤 제작 서비스까지 독립 크리에이터의 콘텐츠를 만날 수 있습니다.") },
            { q: t("How do I access my purchases?", "구매한 콘텐츠는 어디에서 확인하나요?"), a: t("After payment, open My account → Library. Files can be downloaded any time and courses open with lesson progress tracking. Service orders show their status and delivered files on the order page.", "결제 후 내 계정 → 라이브러리에서 확인하세요. 파일은 언제든 다시 다운로드할 수 있고, 강의는 수강 진도와 함께 열립니다. 제작 서비스는 주문 상세에서 진행 상태와 납품 파일을 확인할 수 있습니다.") },
            { q: t("Can I get a refund?", "환불을 받을 수 있나요?"), a: t(`You can request a refund from the order page within ${refundDays} days of payment. The seller or Ringo support reviews each request.`, `결제일로부터 ${refundDays}일 이내에 주문 상세 페이지에서 환불을 요청할 수 있습니다. 판매자 또는 링고 고객센터가 요청을 검토합니다.`) },
            { q: t("How do I contact a seller?", "판매자에게 문의하려면 어떻게 하나요?"), a: t("Use “Ask the seller” on any product page, or “Contact seller” on your order. Replies arrive in My account → Inquiries and by email.", "상품 페이지의 ‘판매자에게 문의’ 또는 주문 상세의 ‘판매자 문의’를 이용하세요. 답변은 내 계정 → 문의 내역과 이메일로 받아볼 수 있습니다.") },
            { q: t("How can I start selling?", "판매자로 시작하려면 어떻게 하나요?"), a: t("Create an account and apply on the Sell on Ringo page. Once approved, you can list products, create coupons and share links from the seller center.", "회원가입 후 ‘링고에서 판매하기’ 페이지에서 입점을 신청하세요. 승인되면 판매자 센터에서 상품 등록, 쿠폰 발행, 판매 링크 공유를 할 수 있습니다.") },
          ].map((f, i) => (
            <AccordionItem key={i} value={`faq-${i}`}><AccordionTrigger>{f.q}</AccordionTrigger><AccordionContent>{f.a}</AccordionContent></AccordionItem>
          ))}
        </Accordion>
      </section>

      <section className="rh-seller rh-shell" aria-labelledby="sell-title">
        <div className="rh-seller-inner">
          <div>
            <p className="rh-kicker">{t("FOR THE MAKERS, THINKERS & DOERS", "만들고, 생각하고, 실천하는 당신에게")}</p>
            <h2 id="sell-title">{t("You make the good stuff.", "좋은 콘텐츠를 만들어 주세요.")}<br /><em>{t("We make room for it.", "링고가 함께할게요.")}</em></h2>
            <p>{t("Turn what you know into something worth sharing. Your digital storefront starts with one good idea.", "당신의 지식과 경험을 나누고 싶은 콘텐츠로. 좋은 아이디어 하나로 디지털 스토어를 시작하세요.")}</p>
            <Link href="/sell" className="sf-seller-btn">{t("Explore selling on Ringo", "링고에서 판매 시작하기")}<ArrowUpRight size={20} aria-hidden /></Link>
          </div>
          <div className="rh-seller-note">
            <span className="rh-seller-symbol">ringo<span>®</span></span>
            <div><span>01</span>{t("Create something useful.", "쓸모 있는 콘텐츠를 만들고.")}</div>
            <div><span>02</span>{t("Share it with your people.", "당신의 사람들에게 공유하고.")}</div>
            <div><span>03</span>{t("Make your next move.", "다음 가능성을 열어보세요.")}</div>
            <small><Link2 size={12} className="mr-1 inline" aria-hidden />{t("YOUR IDEAS BELONG HERE.", "당신의 아이디어가 머무는 곳.")}</small>
          </div>
        </div>
      </section>
    </main>
  );
}
