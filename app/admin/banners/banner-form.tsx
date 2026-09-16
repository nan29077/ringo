"use client";
import type { banners } from "@/db/schema";
import { ActionForm } from "@/components/common/action-form";
import { ImageUploadField } from "@/components/common/uploader";
import { useLang } from "@/components/common/lang-provider";
import { Field, Panel } from "@/components/console/ui";
import { saveBanner } from "./actions";

type Banner = typeof banners.$inferSelect;
const PRESETS = ["banner-books-v2", "banner-course-v2", "banner-design-v2", "banner-books", "banner-course", "banner-design"];
const imageUrl = (key: string | null | undefined) => (!key ? "/images/banner-books-v2.webp" : key.startsWith("preset:") ? `/images/${key.slice(7)}.webp` : key.startsWith("public/") ? `/media/${key}` : "/images/banner-books-v2.webp");

export function BannerForm({ banner, nextSort, startsValue, endsValue }: { banner?: Banner; nextSort: number; startsValue: string; endsValue: string }) {
  const { t } = useLang();
  return (
    <ActionForm action={saveBanner} className="grid gap-4">
      {banner && <input type="hidden" name="id" value={banner.id} />}
      <Panel title={t("Image", "배너 이미지")} description={t("Wide image (about 1600×640). Choose a bundled preset or upload your own.", "가로형 이미지(약 1600×640)를 권장합니다. 기본 이미지를 고르거나 직접 업로드하세요.")}>
        <ImageUploadField name="imageKey" kind="banner" defaultKey={banner?.imageKey ?? "preset:banner-books-v2"} defaultUrl={imageUrl(banner?.imageKey ?? "preset:banner-books-v2")} presets={PRESETS.map((p) => ({ key: `preset:${p}`, url: `/images/${p}.webp`, label: p }))} />
      </Panel>
      <Panel title={t("Text", "문구")}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("Title (Korean)", "제목 (한국어)")} hint={t("Use \" / \" to put the second line in the accent style.", "\" / \"로 나누면 두 번째 줄이 강조 스타일로 표시됩니다.")} required><input name="titleKo" className="rc-input" required maxLength={120} defaultValue={banner?.titleKo ?? ""} /></Field>
          <Field label={t("Title (English)", "제목 (영문)")} required><input name="titleEn" className="rc-input" required maxLength={120} defaultValue={banner?.titleEn ?? ""} /></Field>
          <Field label={t("Subtitle (Korean)", "부제 (한국어)")}><input name="subtitleKo" className="rc-input" maxLength={240} defaultValue={banner?.subtitleKo ?? ""} /></Field>
          <Field label={t("Subtitle (English)", "부제 (영문)")}><input name="subtitleEn" className="rc-input" maxLength={240} defaultValue={banner?.subtitleEn ?? ""} /></Field>
          <Field label={t("Button label (Korean)", "버튼 문구 (한국어)")}><input name="ctaKo" className="rc-input" maxLength={40} defaultValue={banner?.ctaKo ?? ""} /></Field>
          <Field label={t("Button label (English)", "버튼 문구 (영문)")}><input name="ctaEn" className="rc-input" maxLength={40} defaultValue={banner?.ctaEn ?? ""} /></Field>
        </div>
      </Panel>
      <Panel title={t("Link & schedule", "링크 · 노출 기간")}>
        <div className="grid gap-4 md:grid-cols-4">
          <Field className="md:col-span-2" label={t("Link URL", "연결 URL")} hint={t("Starts with / (inside Ringo) or https://", "/ (링고 내부 경로) 또는 https:// 로 시작")}>
            <input name="linkUrl" className="rc-input" maxLength={500} defaultValue={banner?.linkUrl ?? ""} placeholder="/?category=ebooks#catalog" />
          </Field>
          <Field label={t("Sort order", "정렬 순서")} hint={t("Lower comes first", "작을수록 앞")}><input name="sort" type="number" min={0} max={100000} className="rc-input" required defaultValue={banner?.sort ?? nextSort} /></Field>
          <label className="flex items-center gap-2 self-center pt-5 text-sm"><input type="checkbox" name="active" defaultChecked={banner?.active ?? true} /><span className="font-medium">{t("Active", "노출")}</span></label>
          <Field className="md:col-span-2" label={t("Starts", "노출 시작")} hint={t("Blank to start now", "비워두면 즉시")}><input name="startsAt" type="datetime-local" className="rc-input" defaultValue={startsValue} /></Field>
          <Field className="md:col-span-2" label={t("Ends", "노출 종료")} hint={t("Blank for no end", "비워두면 종료 없음")}><input name="endsAt" type="datetime-local" className="rc-input" defaultValue={endsValue} /></Field>
        </div>
      </Panel>
      <div className="flex justify-end">
        <button type="submit" className="rc-btn rc-btn-primary min-w-[140px]">{banner ? t("Save changes", "변경사항 저장") : t("Create banner", "배너 등록")}</button>
      </div>
    </ActionForm>
  );
}
