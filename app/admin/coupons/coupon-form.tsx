"use client";
import { useState } from "react";
import type { coupons } from "@/db/schema";
import { ActionForm } from "@/components/common/action-form";
import { useLang } from "@/components/common/lang-provider";
import { Field, Notice, Panel } from "@/components/console/ui";
import { adminSaveCoupon } from "./actions";

type Coupon = typeof coupons.$inferSelect;

export function AdminCouponForm({ coupon, products, currency, startsValue, endsValue }: { coupon?: Coupon; products: { id: string; titleEn: string; titleKo: string; seller: string }[]; currency: string; startsValue: string; endsValue: string }) {
  const { t, lang } = useLang();
  const [kind, setKind] = useState<"percent" | "fixed">(coupon?.kind ?? "percent");
  const locked = !!coupon && coupon.usedCount > 0;
  const major = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2));
  return (
    <ActionForm action={adminSaveCoupon} className="grid gap-4">
      {coupon && <input type="hidden" name="id" value={coupon.id} />}
      {locked && (
        <Notice tone="warn">
          {t(`This coupon has been used ${coupon!.usedCount} time(s). The code, type and discount value can no longer be changed.`, `이 쿠폰은 ${coupon!.usedCount}회 사용되어 코드, 할인 방식, 할인 값은 변경할 수 없습니다.`)}
        </Notice>
      )}
      {locked && (
        <>
          <input type="hidden" name="code" value={coupon!.code} />
          <input type="hidden" name="kind" value={coupon!.kind} />
          <input type="hidden" name="value" value={coupon!.kind === "percent" ? coupon!.value : (coupon!.value / 100).toFixed(2)} />
        </>
      )}
      <Panel title={t("Coupon", "쿠폰 정보")}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field className="content-start" label={t("Code", "쿠폰 코드")} required hint={t("Uppercase letters, numbers, - and _. Must be unique across Ringo. Platform coupons apply to every seller's products; commission is calculated on the discounted amount the buyer paid.", "영문 대문자, 숫자, -, _ 사용. 링고 전체에서 중복될 수 없습니다. 플랫폼 쿠폰은 모든 판매자 상품에 적용되며, 수수료는 할인 후 실제 결제 금액 기준으로 계산됩니다.")}>
            <input name={locked ? undefined : "code"} className="rc-input uppercase" required minLength={3} maxLength={40} pattern="[A-Za-z0-9_\-]+" defaultValue={coupon?.code ?? ""} disabled={locked} placeholder="SPRING10" />
          </Field>
          <Field className="content-start" label={t("Name", "쿠폰 이름")} required hint={t("Shown to buyers at checkout.", "결제 화면에서 구매자에게 표시됩니다.")}>
            <input name="name" className="rc-input" required maxLength={100} defaultValue={coupon?.name ?? ""} />
          </Field>
          <Field className="content-start" label={t("Applies to", "적용 상품")}>
            <select name="productId" className="rc-select" defaultValue={coupon?.productId ?? ""}>
              <option value="">{t("All products (every seller)", "전체 상품 (모든 판매자)")}</option>
              {products.map((p) => <option key={p.id} value={p.id}>{lang === "ko" ? p.titleKo : p.titleEn} · {p.seller}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={coupon?.active ?? true} />
            <span className="font-medium">{t("Active", "사용 가능")}</span>
          </label>
        </div>
      </Panel>
      <Panel title={t("Discount", "할인")}>
        <div className="grid gap-4 md:grid-cols-4">
          <Field className="content-start" label={t("Type", "할인 방식")} required>
            <select name={locked ? undefined : "kind"} className="rc-select" value={kind} onChange={(e) => setKind(e.target.value as "percent" | "fixed")} disabled={locked}>
              <option value="percent">{t("Percent (%)", "정률 (%)")}</option>
              <option value="fixed">{t(`Fixed amount (${currency})`, `정액 (${currency})`)}</option>
            </select>
          </Field>
          <Field className="content-start" label={kind === "percent" ? t("Discount (%)", "할인율 (%)") : t("Discount amount", "할인 금액")} required>
            <input name={locked ? undefined : "value"} type="number" className="rc-input" required min={kind === "percent" ? 1 : 0.01} max={kind === "percent" ? 100 : 100000} step={kind === "percent" ? 1 : 0.01} disabled={locked} defaultValue={coupon ? (coupon.kind === "percent" ? coupon.value : (coupon.value / 100).toFixed(2)) : ""} />
          </Field>
          <Field className="content-start" label={t("Minimum order", "최소 주문 금액")} hint={t("0 for no minimum", "0이면 제한 없음")}>
            <input name="minOrder" type="number" className="rc-input" min={0} step={0.01} defaultValue={coupon ? major(coupon.minOrderCents) : "0"} />
          </Field>
          {kind === "percent" && (
            <Field className="content-start" label={t("Maximum discount", "최대 할인 금액")} hint={t("Blank for no cap", "비워두면 제한 없음")}>
              <input name="maxDiscount" type="number" className="rc-input" min={0} step={0.01} defaultValue={major(coupon?.maxDiscountCents)} />
            </Field>
          )}
        </div>
      </Panel>
      <Panel title={t("Limits & schedule", "사용 제한 · 기간")}>
        <div className="grid gap-4 md:grid-cols-4">
          <Field className="content-start" label={t("Total usage limit", "전체 사용 한도")} hint={t("Blank for unlimited", "비워두면 무제한")}>
            <input name="usageLimit" type="number" className="rc-input" min={Math.max(1, coupon?.usedCount ?? 0)} step={1} defaultValue={coupon?.usageLimit ?? ""} />
          </Field>
          <Field className="content-start" label={t("Per buyer", "1인당 사용 횟수")} required>
            <input name="perUserLimit" type="number" className="rc-input" min={1} max={100} step={1} required defaultValue={coupon?.perUserLimit ?? 1} />
          </Field>
          <Field className="content-start" label={t("Starts", "시작 일시")} hint={t("Blank to start now", "비워두면 즉시 시작")}>
            <input name="startsAt" type="datetime-local" className="rc-input" defaultValue={startsValue} />
          </Field>
          <Field className="content-start" label={t("Ends", "종료 일시")} hint={t("Blank for no end", "비워두면 종료 없음")}>
            <input name="endsAt" type="datetime-local" className="rc-input" defaultValue={endsValue} />
          </Field>
        </div>
      </Panel>
      <div className="flex justify-end">
        <button type="submit" className="rc-btn rc-btn-primary min-w-[140px]">{coupon ? t("Save changes", "변경사항 저장") : t("Create coupon", "쿠폰 만들기")}</button>
      </div>
    </ActionForm>
  );
}
