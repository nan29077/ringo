"use client";
import { useEffect } from "react";
import { useLang } from "@/components/common/lang-provider";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useLang();
  useEffect(() => { console.error(error); }, [error]);
  return (
    <section role="alert" className="mx-auto my-12 max-w-xl rounded-xl border border-[#e9e3dc] bg-white px-6 py-10 text-center shadow-sm">
      <h1 className="text-xl font-bold text-[#23231f]">{t("We couldn't load this page.", "페이지를 불러오지 못했습니다.")}</h1>
      <p className="mt-2 text-sm text-[#6b7065]">{t("Please check your connection and try again. Your saved data is safe.", "연결 상태를 확인한 뒤 다시 시도하세요. 저장된 데이터는 유지됩니다.")}</p>
      <button type="button" onClick={reset} className="mt-5 rounded-lg bg-[#ed4b2e] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#d9401f]">{t("Try again", "다시 시도")}</button>
    </section>
  );
}
