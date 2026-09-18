"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/common/lang-provider";

export type HeroSlide = { id: string; title: string; subtitle: string | null; cta: string | null; image: string; href: string | null };

/** Split "Small downloads. Big possibilities." into a plain line and an accented line. */
function splitTitle(title: string): [string, string | null] {
  const slash = title.indexOf(" / ");
  if (slash > 0) return [title.slice(0, slash).trim(), title.slice(slash + 3).trim() || null];
  const nl = title.indexOf("\n");
  if (nl > 0) return [title.slice(0, nl).trim(), title.slice(nl + 1).trim() || null];
  const m = title.match(/^(.+?[.!?。])\s+(.+)$/);
  return m ? [m[1], m[2]] : [title, null];
}

function SlideLink({ href, children }: { href: string; children: React.ReactNode }) {
  const external = /^https?:\/\//.test(href);
  return (
    <Button asChild>
      {external ? <a href={href} rel="noopener">{children}</a> : <Link href={href}>{children}</Link>}
    </Button>
  );
}

/** Home hero carousel driven by the `banners` table (keeps the original Ringo slide look). */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const { t } = useLang();
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!api) return;
    const select = () => setCurrent(api.selectedScrollSnap());
    select();
    api.on("select", select);
    return () => { api.off("select", select); };
  }, [api]);
  useEffect(() => {
    if (!api || paused || slides.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => api.scrollNext(), 7000);
    return () => clearInterval(id);
  }, [api, paused, slides.length]);
  const total = String(slides.length).padStart(2, "0");
  return (
    <section className="rh-banner rh-shell" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
      <Carousel setApi={setApi} opts={{ loop: slides.length > 1 }} aria-label={t("Ringo highlights", "링고 추천 배너")}>
        <CarouselContent>
          {slides.map((s, i) => {
            const [line, accent] = splitTitle(s.title);
            const Heading = i === 0 ? "h1" : "h2";
            return (
              <CarouselItem key={s.id}>
                <div className={`rh-slide slide-${i % 3}`} inert={i !== current}>
                  <div className="rh-slide-copy">
                    <p className="rh-kicker"><Sparkles size={15} aria-hidden />{t("RINGO SELECTS", "링고 셀렉트")}</p>
                    <Heading className="rh-slide-title">{line}{accent && <><br /><em>{accent}</em></>}</Heading>
                    {s.subtitle && <p>{s.subtitle}</p>}
                    {s.href && <SlideLink href={s.href}>{s.cta || t("Explore", "둘러보기")}<ArrowUpRight size={18} aria-hidden /></SlideLink>}
                    <span className="rh-slide-sign">ringo® · DIGITAL GOODS. HUMAN CREATIVITY.</span>
                  </div>
                  <div className="rh-slide-art">
                    <img src={s.image} alt="" fetchPriority={i === 0 ? "high" : "auto"} loading={i === 0 ? "eager" : "lazy"} />
                  </div>
                </div>
              </CarouselItem>
            );
          })}
        </CarouselContent>
        {slides.length > 1 && (
          <div className="rh-slider-controls">
            <span aria-live="polite">{String(current + 1).padStart(2, "0")} <span>/ {total}</span></span>
            <div>
              {slides.map((s, i) => (
                <button key={s.id} type="button" className={current === i ? "active" : ""} aria-label={t(`Show banner ${i + 1}`, `${i + 1}번 배너 보기`)} aria-current={current === i ? "true" : undefined} onClick={() => api?.scrollTo(i)} />
              ))}
            </div>
            <div>
              <Button variant="ghost" size="icon" aria-label={t("Previous banner", "이전 배너")} onClick={() => api?.scrollPrev()}><ArrowLeft /></Button>
              <Button variant="ghost" size="icon" aria-label={t("Next banner", "다음 배너")} onClick={() => api?.scrollNext()}><ArrowRight /></Button>
            </div>
          </div>
        )}
      </Carousel>
    </section>
  );
}
