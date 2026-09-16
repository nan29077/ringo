import type { deepLinks } from "@/db/schema";
import type { Lang, T } from "@/lib/i18n";
import { ActionForm } from "@/components/common/action-form";
import { Field, Panel } from "@/components/console/ui";
import { sellerSaveLink } from "./actions";

type Link = typeof deepLinks.$inferSelect;

export function LinkForm({ t, lang, products, coupons, link, defaultProductId, expiresValue, origin }: {
  t: T;
  lang: Lang;
  products: { id: string; titleEn: string; titleKo: string }[];
  coupons: { code: string; name: string }[];
  link?: Link;
  defaultProductId?: string;
  expiresValue: string;
  origin: string;
}) {
  return (
    <ActionForm action={sellerSaveLink} className="grid gap-4">
      {link && <input type="hidden" name="id" value={link.id} />}
      <Panel title={t("Link details", "링크 정보")}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field className="content-start" label={t("Product", "상품")} required hint={t("Only products currently on sale can be linked.", "판매중인 상품만 연결할 수 있습니다.")}>
            <select name="productId" className="rc-select" required defaultValue={link?.productId ?? defaultProductId ?? ""}>
              <option value="" disabled>{t("Select a product", "상품 선택")}</option>
              {products.map((p) => <option key={p.id} value={p.id}>{lang === "ko" ? p.titleKo : p.titleEn}</option>)}
            </select>
          </Field>
          <Field className="content-start" label={t("Link name", "링크 이름")} required hint={t("For your reference, e.g. Instagram bio · September", "관리용 이름 (예: 인스타그램 프로필 · 9월)")}>
            <input name="name" className="rc-input" required maxLength={100} defaultValue={link?.name ?? ""} />
          </Field>
          {link ? (
            <Field className="content-start" label={t("Code", "코드")} hint={t("The code cannot be changed after creation.", "코드는 생성 후 변경할 수 없습니다.")}>
              <input className="rc-input bg-[#f6f7f9]" value={`${origin}/l/${link.code}`} readOnly />
            </Field>
          ) : (
            <Field className="content-start" label={t("Custom code (optional)", "사용자 지정 코드 (선택)")} hint={t("Letters, numbers and hyphens. Leave blank for a random code.", "영문, 숫자, 하이픈. 비워두면 자동 생성됩니다.")}>
              <div className="flex items-center gap-2"><span className="whitespace-nowrap text-xs text-[#8a8d96]">{origin}/l/</span><input name="code" className="rc-input" maxLength={40} pattern="[a-zA-Z0-9\-]*" placeholder="spring-sale" /></div>
            </Field>
          )}
          <Field className="content-start" label={t("Destination", "이동 위치")}>
            <select name="destination" className="rc-select" defaultValue={link?.destination ?? "product"}>
              <option value="product">{t("Product page", "상품 페이지")}</option>
              <option value="checkout">{t("Checkout (direct purchase)", "바로 결제 페이지")}</option>
            </select>
          </Field>
        </div>
      </Panel>
      <Panel title={t("Tracking", "유입 추적")} description={t("Letters, numbers, dots, hyphens and underscores only.", "영문, 숫자, 마침표, 하이픈, 밑줄만 사용할 수 있습니다.")}>
        <div className="grid gap-4 md:grid-cols-3">
          <Field className="content-start" label={t("Source", "소스")} required hint={t("e.g. instagram, youtube, newsletter", "예: instagram, youtube, newsletter")}>
            <input name="source" className="rc-input" required maxLength={60} pattern="[\w.\-]+" defaultValue={link?.source ?? ""} />
          </Field>
          <Field className="content-start" label={t("Medium", "매체")} hint={t("e.g. social, email, video", "예: social, email, video")}>
            <input name="medium" className="rc-input" maxLength={60} pattern="[\w.\-]*" defaultValue={link?.medium ?? "link"} />
          </Field>
          <Field className="content-start" label={t("Campaign", "캠페인")}>
            <input name="campaign" className="rc-input" maxLength={80} pattern="[\w.\-]*" defaultValue={link?.campaign ?? ""} />
          </Field>
        </div>
      </Panel>
      <Panel title={t("Options", "옵션")}>
        <div className="grid gap-4 md:grid-cols-3">
          <Field className="content-start" label={t("Page language", "페이지 언어")}>
            <select name="locale" className="rc-select" defaultValue={link?.locale ?? "en"}>
              <option value="en">English</option>
              <option value="ko">한국어</option>
            </select>
          </Field>
          <Field className="content-start" label={t("Auto-apply coupon", "자동 적용 쿠폰")} hint={t("Only your own coupons can be attached.", "내 스토어 쿠폰만 연결할 수 있습니다.")}>
            <select name="couponCode" className="rc-select" defaultValue={link?.couponCode ?? ""}>
              <option value="">{t("None", "없음")}</option>
              {coupons.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.name}</option>)}
            </select>
          </Field>
          <Field className="content-start" label={t("Expires at", "만료 일시")} hint={t("Leave blank for no expiry.", "비워두면 만료되지 않습니다.")}>
            <input name="expiresAt" type="datetime-local" className="rc-input" defaultValue={expiresValue} />
          </Field>
        </div>
      </Panel>
      <div className="flex justify-end">
        <button type="submit" className="rc-btn rc-btn-primary min-w-[140px]">{link ? t("Save changes", "변경사항 저장") : t("Create link", "링크 만들기")}</button>
      </div>
    </ActionForm>
  );
}
