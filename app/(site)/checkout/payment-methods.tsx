import { CreditCard } from "lucide-react";
import type { PaymentOption } from "@/lib/server/checkout";
import type { T } from "@/lib/i18n";

export function PaymentMethods({ options, t, step }: { options: PaymentOption[]; t: T; step: number }) {
  const firstReady = options.find((o) => o.available)?.id;
  return (
    <fieldset className="grid gap-2.5">
      <legend className="sf-step"><b>{step}</b><span className="sf-h2">{t("Payment method", "결제 수단")}</span></legend>
      {options.length === 0 && <div className="sf-notice sf-notice-warn">{t("Online payment is temporarily unavailable. Please try again later.", "현재 온라인 결제를 이용할 수 없습니다. 잠시 후 다시 시도하세요.")}</div>}
      {options.map((o) => (
        <label key={o.id} className="sf-radio">
          <input type="radio" name="provider" value={o.id} defaultChecked={o.id === firstReady} disabled={!o.available} required />
          <CreditCard size={18} className="text-[#6b7065]" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-[#20211f]">{o.label}</span>
            {o.note && <span className="block text-[13px] text-[#6b7065]">{o.note}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
