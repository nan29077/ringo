"use client";
import { Fragment } from "react";
import { Star } from "lucide-react";
import { ActionForm } from "@/components/common/action-form";
import { useLang } from "@/components/common/lang-provider";
import { submitReview } from "../../actions";

export function ReviewForm({ orderId }: { orderId: string }) {
  const { t } = useLang();
  return (
    <ActionForm action={submitReview} className="grid gap-4">
      <input type="hidden" name="orderId" value={orderId} />
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-[#33352f]">{t("Your rating", "별점")}</legend>
        <div className="sf-rating-input">
          {[5, 4, 3, 2, 1].map((n) => (
            <Fragment key={n}>
              <input type="radio" id={`rating-${n}`} name="rating" value={n} required />
              <label htmlFor={`rating-${n}`} title={t(`${n} out of 5`, `5점 중 ${n}점`)}>
                <Star size={30} fill="currentColor" aria-hidden />
                <span className="sr-only">{t(`${n} stars`, `${n}점`)}</span>
              </label>
            </Fragment>
          ))}
        </div>
      </fieldset>
      <label className="sf-field">
        <span>{t("Your review (optional)", "리뷰 내용 (선택)")}</span>
        <textarea name="body" maxLength={2000} className="sf-textarea" placeholder={t("What did you like? Who would you recommend it to?", "어떤 점이 좋았나요? 누구에게 추천하고 싶나요?")} />
        <small>{t("Your first name and last initial are shown with your review.", "리뷰에는 이름과 성의 첫 글자만 표시됩니다.")}</small>
      </label>
      <button className="sf-btn sf-btn-dark justify-self-start">{t("Post review", "리뷰 등록")}</button>
    </ActionForm>
  );
}
