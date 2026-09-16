"use client";
import { ArrowRight, ShieldCheck, ShoppingBag, Store } from "lucide-react";
import { ActionButton } from "@/components/common/action-form";
import { useLang } from "@/components/common/lang-provider";
import { demoLogin } from "./actions";

const roles = [
  { id: "admin", icon: ShieldCheck, en: "Super admin test login", ko: "최고 관리자 테스트 로그인", email: "admin@ringo.local" },
  { id: "seller", icon: Store, en: "Seller test login", ko: "판매자 테스트 로그인", email: "studio@ringo.local" },
  { id: "buyer", icon: ShoppingBag, en: "Buyer test login", ko: "구매자 테스트 로그인", email: "buyer@ringo.local" },
] as const;

export function DemoLoginButtons({ next }: { next?: string }) {
  const { t } = useLang();
  return (
    <section className="mt-6 border-t border-[#efeee9] pt-5" aria-label={t("Test logins", "테스트 로그인")}>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-[#3b3d46]">{t("Test login", "테스트 로그인")}</span>
        <span className="text-[11px] text-[#8a8b84]">{t("Development only · one click", "개발용 · 클릭 한 번으로 로그인")}</span>
      </div>
      <div className="grid gap-2">
        {roles.map((r) => (
          <ActionButton key={r.id} variant="outline" className="!h-auto w-full !justify-start gap-3 !rounded-lg !border-[#e4e3de] !px-3.5 !py-3 text-left hover:!border-[#ed4b2e] hover:!bg-[#fff7f4]" action={demoLogin.bind(null, r.id, next)}>
            <r.icon className="text-[#ed4b2e]" />
            <span className="flex-1">
              <span className="block text-[13.5px] font-semibold text-[#1c1d22]">{t(r.en, r.ko)}</span>
              <span className="block text-[11.5px] font-normal text-[#8a8b84]">{r.email}</span>
            </span>
            <ArrowRight className="text-[#b3b5bc]" />
          </ActionButton>
        ))}
      </div>
    </section>
  );
}
