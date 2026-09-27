"use client";
import { useLang } from "@/components/common/lang-provider";

export default function RouteLoading() {
  const { t } = useLang();
  return (
    <div role="status" aria-live="polite" className="mx-auto w-full max-w-6xl px-5 py-8">
      <span className="sr-only">{t("Loading page", "페이지를 불러오는 중")}</span>
      <div aria-hidden="true" className="space-y-5 motion-safe:animate-pulse">
        <div className="h-8 w-52 rounded-lg bg-[#e9e9e5]" />
        <div className="h-4 w-80 max-w-full rounded bg-[#eeeeea]" />
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-32 rounded-xl border border-[#ededeb] bg-[#f1f1ee]" />)}
        </div>
        <div className="h-56 rounded-xl border border-[#ededeb] bg-[#f1f1ee]" />
      </div>
    </div>
  );
}
