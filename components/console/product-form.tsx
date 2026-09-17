"use client";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { products, DeliveryType, Lesson } from "@/db/schema";
import type { ActionResult } from "@/lib/server/action";
import { ActionForm } from "@/components/common/action-form";
import { ImageUploadField } from "@/components/common/uploader";
import { useLang } from "@/components/common/lang-provider";
import { deliveryType as deliveryTypeLabels } from "@/lib/status";

export type ProductRow = typeof products.$inferSelect;
export type ProductFormCategory = { id: string; nameEn: string; nameKo: string; deliveryType: DeliveryType };

const PRESETS = ["book", "type", "coast", "banner-books", "banner-course", "banner-design"];
const presetUrl = (key: string | null | undefined) => {
  if (!key) return "/images/book.webp";
  if (key.startsWith("preset:")) return `/images/${key.slice(7)}.webp`;
  if (key.startsWith("public/")) return `/media/${key}`;
  return "/images/book.webp";
};

type LessonRow = { key: number; title: string; minutes: string; preview: boolean; assetId: string; videoUrl: string; body: string };
let seq = 0;
const toRow = (l: Partial<Lesson>): LessonRow => ({ key: ++seq, title: l.title ?? "", minutes: l.minutes ? String(l.minutes) : "", preview: !!l.preview, assetId: l.assetId ?? "", videoUrl: l.videoUrl ?? "", body: l.body ?? "" });

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rc-panel">
      <div className="border-b border-[#eef0f3] px-5 py-4">
        <h2 className="text-[15px] font-semibold text-[#1c1d22]">{title}</h2>
        {description && <p className="!mt-0.5 text-xs text-[#8a8d96]">{description}</p>}
      </div>
      <div className="grid gap-4 p-5">{children}</div>
    </section>
  );
}

function F({ label, hint, required, children, className = "" }: { label: string; hint?: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <label className={`grid content-start gap-1.5 text-sm ${className}`}>
      <span className="font-medium text-[#3b3d46]">{label}{required && <span className="ml-0.5 text-[#e5484d]">*</span>}</span>
      {children}
      {hint && <span className="text-xs text-[#8a8d96]">{hint}</span>}
    </label>
  );
}

/**
 * Product create/edit form shared by the seller center and the admin console.
 * Submits FormData compatible with `productInput` in lib/server/catalog.ts.
 */
export function ProductForm({ action, categories, product, assets = [], sellers, submitLabel, admin = false }: {
  action: (fd: FormData) => Promise<ActionResult>;
  categories: ProductFormCategory[];
  product?: ProductRow;
  assets?: { id: string; filename: string }[];
  /** Admin only: shows a seller select when creating a product. */
  sellers?: { id: string; name: string }[];
  submitLabel?: string;
  /** Admin console: delivery type stays editable. */
  admin?: boolean;
}) {
  const { t, lang } = useLang();
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? "");
  const [lessons, setLessons] = useState<LessonRow[]>(() => (product?.lessons ?? []).map(toRow));
  const category = categories.find((c) => c.id === categoryId);
  const type: DeliveryType = category?.deliveryType ?? product?.deliveryType ?? "download";
  const lessonsJson = useMemo(
    () => JSON.stringify(lessons.filter((l) => l.title.trim()).map((l) => ({ title: l.title.trim(), minutes: l.minutes ? Number(l.minutes) : null, preview: l.preview, assetId: l.assetId || null, videoUrl: l.videoUrl.trim() || null, body: l.body.trim() || null }))),
    [lessons],
  );
  const update = (key: number, patch: Partial<LessonRow>) => setLessons((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, dir: -1 | 1) =>
    setLessons((rows) => {
      const next = [...rows];
      const j = index + dir;
      if (j < 0 || j >= next.length) return rows;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  const major = (cents: number | null | undefined) => (cents == null ? "" : (cents / 100).toFixed(2));
  const typeLabel = deliveryTypeLabels[type];

  return (
    <ActionForm action={action} className="grid gap-4">
      {product && <input type="hidden" name="id" value={product.id} />}
      <input type="hidden" name="lessons" value={type === "course" ? lessonsJson : ""} />

      <Section title={t("Basic information", "기본 정보")} description={t("The category decides how buyers receive the product.", "카테고리에 따라 구매자가 상품을 받는 방식이 정해집니다.")}>
        {sellers && !product && (
          <F label={t("Seller", "판매자")} required>
            <select name="sellerId" className="rc-select" required defaultValue="">
              <option value="" disabled>{t("Select a seller", "판매자 선택")}</option>
              {sellers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </F>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <F label={t("Category", "카테고리")} required hint={[typeLabel ? t(`Delivery: ${typeLabel.en}`, `제공 방식: ${typeLabel.ko}`) : "", product && (product.publishedAt || product.salesCount > 0 || product.status === "pending_review") && !admin ? t("The delivery type cannot be changed once a product is in review, approved or sold.", "심사 중이거나 심사를 통과했거나 판매된 상품은 제공 방식을 바꿀 수 없습니다.") : ""].filter(Boolean).join(" · ") || undefined}>
            <select name="categoryId" className="rc-select" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => <option key={c.id} value={c.id}>{lang === "ko" ? c.nameKo : c.nameEn}</option>)}
            </select>
          </F>
          <F label={t("Format label", "형식 표기")} hint={t("e.g. PDF · 120 pages, 4 video lessons", "예: PDF · 120쪽, 영상 4강")}>
            <input name="formatLabel" className="rc-input" maxLength={120} defaultValue={product?.formatLabel ?? ""} />
          </F>
        </div>
        {type === "service" && (
          <F label={t("Delivery time (days)", "제작 기간(일)")} required hint={t("Due date is calculated from the payment time.", "결제 시점부터 납기일이 계산됩니다.")} className="md:max-w-[240px]">
            <input name="deliveryDays" type="number" min={1} max={180} className="rc-input" defaultValue={product?.deliveryDays ?? 7} required />
          </F>
        )}
        {(type === "download" || type === "collection") && (
          <p className="text-xs text-[#8a8d96]">{t("After saving, upload the files buyers will download. At least one file is required before submitting for review.", "저장 후 구매자가 받을 파일을 업로드하세요. 심사 요청 전 최소 1개의 파일이 필요합니다.")}</p>
        )}
      </Section>

      <Section title={t("Title & summary", "상품명 · 요약")}>
        <div className="grid gap-4 md:grid-cols-2">
          <F label={t("Title (English)", "상품명 (영문)")} required>
            <input name="titleEn" className="rc-input" required maxLength={140} defaultValue={product?.titleEn ?? ""} />
          </F>
          <F label={t("Title (Korean)", "상품명 (한국어)")} required>
            <input name="titleKo" className="rc-input" required maxLength={140} defaultValue={product?.titleKo ?? ""} />
          </F>
          <F label={t("Summary (English)", "요약 (영문)")} hint={t("Shown on cards and search results. Up to 300 characters.", "카드와 검색 결과에 표시됩니다. 최대 300자.")}>
            <textarea name="summaryEn" className="rc-textarea !min-h-[72px]" maxLength={300} defaultValue={product?.summaryEn ?? ""} />
          </F>
          <F label={t("Summary (Korean)", "요약 (한국어)")}>
            <textarea name="summaryKo" className="rc-textarea !min-h-[72px]" maxLength={300} defaultValue={product?.summaryKo ?? ""} />
          </F>
        </div>
      </Section>

      <Section title={t("Description", "상세 설명")}>
        <div className="grid gap-4 md:grid-cols-2">
          <F label={t("Description (English)", "상세 설명 (영문)")}>
            <textarea name="descriptionEn" className="rc-textarea !min-h-[200px]" maxLength={20000} defaultValue={product?.descriptionEn ?? ""} />
          </F>
          <F label={t("Description (Korean)", "상세 설명 (한국어)")}>
            <textarea name="descriptionKo" className="rc-textarea !min-h-[200px]" maxLength={20000} defaultValue={product?.descriptionKo ?? ""} />
          </F>
        </div>
      </Section>

      {type === "course" && (
        <Section title={t("Lessons", "강의 목차")} description={t("Add lessons in order. Each lesson can have a video link (YouTube, Vimeo or a direct video URL), an uploaded file and lesson notes. Preview lessons are visible before purchase.", "순서대로 강의를 추가하세요. 각 강의에는 영상 링크(YouTube·Vimeo·영상 파일 URL), 업로드 파일, 강의 노트를 넣을 수 있습니다. 미리보기 강의는 구매 전에도 볼 수 있습니다.")}>
          {lessons.length === 0 && <p className="text-sm text-[#8a8d96]">{t("No lessons yet.", "등록된 강의가 없습니다.")}</p>}
          <div className="grid gap-2">
            {lessons.map((l, i) => (
              <div key={l.key} className="grid items-center gap-2 rounded-lg border border-[#eef0f3] bg-[#fafbfc] p-2.5 md:grid-cols-[28px_1fr_90px_auto_180px_auto]">
                <span className="text-xs font-bold text-[#8a8d96]">{String(i + 1).padStart(2, "0")}</span>
                <input aria-label={t("Lesson title", "강의 제목")} placeholder={t("Lesson title", "강의 제목")} className="rc-input" maxLength={200} value={l.title} onChange={(e) => update(l.key, { title: e.target.value })} />
                <input aria-label={t("Minutes", "분")} placeholder={t("Min", "분")} type="number" min={0} max={999} className="rc-input" value={l.minutes} onChange={(e) => update(l.key, { minutes: e.target.value })} />
                <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-[#3b3d46]">
                  <input type="checkbox" checked={l.preview} onChange={(e) => update(l.key, { preview: e.target.checked })} />
                  {t("Preview", "미리보기")}
                </label>
                <select aria-label={t("Attached file", "연결 파일")} className="rc-select" value={l.assetId} onChange={(e) => update(l.key, { assetId: e.target.value })}>
                  <option value="">{t("No file", "파일 없음")}</option>
                  {assets.map((a) => <option key={a.id} value={a.id}>{a.filename}</option>)}
                </select>
                <div className="flex gap-1">
                  <button type="button" className="rc-btn rc-btn-outline rc-btn-sm !px-2" aria-label={t("Move up", "위로")} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></button>
                  <button type="button" className="rc-btn rc-btn-outline rc-btn-sm !px-2" aria-label={t("Move down", "아래로")} disabled={i === lessons.length - 1} onClick={() => move(i, 1)}><ArrowDown /></button>
                  <button type="button" className="rc-btn rc-btn-danger rc-btn-sm !px-2" aria-label={t("Remove", "삭제")} onClick={() => setLessons((rows) => rows.filter((r) => r.key !== l.key))}><Trash2 /></button>
                </div>
                <details className="md:col-span-6" open={!!(l.videoUrl || l.body)}>
                  <summary className="cursor-pointer text-xs font-medium text-[#2f4ac2]">{t("Lesson content", "강의 콘텐츠")}{l.videoUrl || l.body ? "" : ` · ${t("none yet", "미입력")}`}</summary>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <label className="grid gap-1 text-xs text-[#6b6e78]">
                      {t("Video URL (YouTube, Vimeo or direct video link)", "영상 URL (YouTube, Vimeo 또는 영상 파일 링크)")}
                      <input type="url" className="rc-input" maxLength={500} placeholder="https://www.youtube.com/watch?v=…" value={l.videoUrl} onChange={(e) => update(l.key, { videoUrl: e.target.value })} />
                    </label>
                    <label className="grid gap-1 text-xs text-[#6b6e78]">
                      {t("Lesson notes (shown under the video)", "강의 노트 (영상 아래에 표시)")}
                      <textarea className="rc-textarea !min-h-[72px]" maxLength={20000} value={l.body} onChange={(e) => update(l.key, { body: e.target.value })} />
                    </label>
                  </div>
                </details>
              </div>
            ))}
          </div>
          <div>
            <button type="button" className="rc-btn rc-btn-outline rc-btn-sm" onClick={() => setLessons((rows) => [...rows, toRow({})])}><Plus />{t("Add lesson", "강의 추가")}</button>
            {!product && assets.length === 0 && <span className="ml-3 text-xs text-[#8a8d96]">{t("Files can be attached after the product is saved.", "파일 연결은 상품 저장 후 가능합니다.")}</span>}
          </div>
        </Section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t("Pricing", "가격")} description={t("Enter amounts in major units (e.g. 19.99).", "금액은 기본 단위로 입력하세요 (예: 19.99).")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <F label={t("Price", "판매가")} required hint={t("0 makes the product free.", "0이면 무료 상품입니다.")}>
              <input name="price" type="number" min={0} max={100000} step="0.01" className="rc-input" required defaultValue={major(product?.priceCents) || ""} />
            </F>
            <F label={t("Compare-at price", "정가 (할인 전)")} hint={t("Optional. Must be higher than the price; shown struck through.", "선택. 판매가보다 높아야 하며 취소선으로 표시됩니다.")}>
              <input name="compareAt" type="number" min={0} max={100000} step="0.01" className="rc-input" defaultValue={major(product?.compareAtCents)} />
            </F>
          </div>
        </Section>
        <Section title={t("Cover image", "대표 이미지")}>
          <ImageUploadField
            name="coverKey"
            kind="cover"
            defaultKey={product?.coverKey ?? "preset:book"}
            defaultUrl={presetUrl(product?.coverKey ?? "preset:book")}
            presets={PRESETS.map((p) => ({ key: `preset:${p}`, url: `/images/${p}.webp`, label: p }))}
          />
        </Section>
      </div>

      <Section title={t("Address & SEO", "주소 · 검색 노출")}>
        <div className="grid gap-4 md:grid-cols-2">
          <F label={t("URL slug", "상품 주소")} hint={product ? t(`Current: /p/${product.slug} · an address already in use is rejected.`, `현재: /p/${product.slug} · 이미 사용 중인 주소는 저장되지 않습니다.`) : t("Leave blank to generate from the English title. An address already in use is rejected.", "비워두면 영문 상품명으로 자동 생성됩니다. 이미 사용 중인 주소는 저장되지 않습니다.")}>
            <input name="slug" className="rc-input" maxLength={80} defaultValue={product?.slug ?? ""} placeholder="my-product" />
          </F>
          <F label={t("SEO title", "검색 제목")} hint={t("Defaults to the product title.", "비워두면 상품명을 사용합니다.")}>
            <input name="seoTitle" className="rc-input" maxLength={160} defaultValue={product?.seoTitle ?? ""} />
          </F>
          <F label={t("SEO description", "검색 설명")} className="md:col-span-2">
            <textarea name="seoDescription" className="rc-textarea !min-h-[64px]" maxLength={300} defaultValue={product?.seoDescription ?? ""} />
          </F>
        </div>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-1 flex justify-end gap-2 border-t border-[#e9ebef] bg-[#f6f7f9]/95 px-1 py-3 backdrop-blur">
        <button type="submit" className="rc-btn rc-btn-primary min-w-[140px]">{submitLabel ?? (product ? t("Save changes", "변경사항 저장") : t("Save as draft", "임시저장"))}</button>
      </div>
    </ActionForm>
  );
}
