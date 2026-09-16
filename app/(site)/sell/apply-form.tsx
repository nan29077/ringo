import type { SellerProfile } from "@/lib/server/auth";
import type { T } from "@/lib/i18n";
import { ActionForm } from "@/components/common/action-form";
import { submitSellerApplication } from "./actions";

const input = "h-11 w-full rounded-lg border border-[#dfdfd9] bg-white px-3.5 text-[15px] outline-none focus:border-[#ed4b2e] focus:ring-3 focus:ring-[#ed4b2e22]";

function Label({ label, hint, required, children, className = "" }: { label: string; hint?: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <label className={`grid content-start gap-1.5 text-sm ${className}`}>
      <span className="font-medium text-[#3b3d46]">{label}{required && <span className="ml-0.5 text-[#ed4b2e]">*</span>}</span>
      {children}
      {hint && <span className="text-xs leading-relaxed text-[#8a8c84]">{hint}</span>}
    </label>
  );
}

/** Seller application (first time or re-apply after rejection). */
export function ApplyForm({ t, seller, submitLabel }: { t: T; seller?: SellerProfile | null; submitLabel: string }) {
  return (
    <ActionForm action={submitSellerApplication} className="grid gap-6">
      <fieldset className="grid gap-4">
        <legend className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#8a8c84]">{t("Your store", "스토어 정보")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Label label={t("Store name", "스토어 이름")} required>
            <input name="displayName" className={input} required minLength={2} maxLength={60} defaultValue={seller?.displayName ?? ""} placeholder="Studio North" />
          </Label>
          <Label label={t("Store address", "스토어 주소")} required hint={t("ringo.com/s/your-address · lowercase letters, numbers, hyphens", "ringo.com/s/주소 · 영문 소문자, 숫자, 하이픈")}>
            <input name="slug" className={input} required minLength={3} maxLength={40} pattern="[a-z0-9\-]+" defaultValue={seller?.slug ?? ""} placeholder="studio-north" />
          </Label>
        </div>
        <Label label={t("Website or portfolio", "웹사이트 · 포트폴리오")}>
          <input name="website" className={input} maxLength={200} defaultValue={seller?.website ?? ""} placeholder="https://" />
        </Label>
        <Label label={t("Short bio", "스토어 소개")} hint={t("Shown on your public store page.", "공개 스토어 페이지에 표시됩니다.")}>
          <textarea name="bio" className={`${input} h-auto min-h-[90px] py-3`} maxLength={1000} defaultValue={seller?.bio ?? ""} />
        </Label>
        <Label label={t("What will you sell?", "어떤 상품을 판매하실 건가요?")} required hint={t("Tell us about your products, experience and where we can see your work (at least 10 characters).", "판매할 상품, 경력, 작업물을 볼 수 있는 곳을 알려주세요 (10자 이상).")}>
          <textarea name="applicationNote" className={`${input} h-auto min-h-[120px] py-3`} required minLength={10} maxLength={2000} defaultValue={seller?.applicationNote ?? ""} />
        </Label>
      </fieldset>

      <fieldset className="grid gap-4 border-t border-[#efeee9] pt-6">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#8a8c84]">{t("Payout account · optional now", "정산 계좌 · 나중에 입력 가능")}</legend>
        <p className="!-mt-1 text-xs text-[#8a8c84]">{t("You can add or change this later in the seller center.", "판매자 센터에서 언제든 등록·변경할 수 있습니다.")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Label label={t("Payout method", "지급 방식")}>
            <select name="payoutMethod" className={input} defaultValue={seller?.payoutMethod ?? "bank"}>
              <option value="bank">{t("Bank transfer", "은행 송금")}</option>
              <option value="gcash">GCash</option>
              <option value="maya">Maya</option>
              <option value="paypal">PayPal</option>
              <option value="other">{t("Other", "기타")}</option>
            </select>
          </Label>
          <Label label={t("Bank / provider", "은행 · 서비스명")}>
            <input name="payoutBankName" className={input} maxLength={80} defaultValue={seller?.payoutBankName ?? ""} />
          </Label>
          <Label label={t("Account holder", "예금주")}>
            <input name="payoutAccountName" className={input} maxLength={120} defaultValue={seller?.payoutAccountName ?? ""} />
          </Label>
          <Label label={t("Account number / ID", "계좌번호 · 계정 ID")}>
            <input name="payoutAccountNumber" className={input} maxLength={60} autoComplete="off" defaultValue={seller?.payoutAccountNumber ?? ""} />
          </Label>
        </div>
      </fieldset>

      <button type="submit" className="h-12 w-full rounded-lg bg-[#ed4b2e] text-[15px] font-semibold text-white transition hover:bg-[#d9401f] disabled:opacity-60">{submitLabel}</button>
      <p className="!-mt-2 text-center text-xs text-[#8a8c84]">{t("By applying you agree to the Ringo seller terms and content guidelines.", "신청하면 링고 판매자 약관 및 콘텐츠 가이드라인에 동의하게 됩니다.")}</p>
    </ActionForm>
  );
}
