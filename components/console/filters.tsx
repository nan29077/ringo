"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Download, RotateCcw, Search } from "lucide-react";
import { useLang } from "@/components/common/lang-provider";

export type FilterField =
  | { type: "search"; name: string; placeholder: [string, string] }
  | { type: "select"; name: string; label: [string, string]; options: { value: string; en: string; ko: string }[] }
  | { type: "period"; name?: string }
  | { type: "date"; name: string; label: [string, string] }
  | { type: "range"; name: [string, string]; label: [string, string]; unit?: string; step?: string };

const periods = [
  ["today", "Today", "오늘"],
  ["7d", "7 days", "7일"],
  ["1m", "1 month", "1개월"],
  ["3m", "3 months", "3개월"],
  ["1y", "1 year", "1년"],
  ["all", "All", "전체"],
] as const;

/** Search/filter panel modelled on the reference back office: fields → URL query → server-side filtering. */
export function FilterBar({ fields, exportHref }: { fields: FilterField[]; exportHref?: string }) {
  const { t } = useLang();
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(params.entries()));
  const set = (k: string, v: string) => setValues((prev) => ({ ...prev, [k]: v }));
  const apply = (next: Record<string, string>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v && k !== "page") q.set(k, v);
    start(() => router.push(`${path}${q.size ? "?" + q : ""}`));
  };
  const hasPeriod = fields.some((f) => f.type === "period");

  return (
    <form
      className="rc-filter"
      onSubmit={(e) => {
        e.preventDefault();
        apply(values);
      }}
    >
      <div className="grid gap-3 md:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        {fields.map((f, i) => {
          if (f.type === "search")
            return (
              <label key={i} className="rc-filter-field md:col-span-2">
                <Search className="size-4 text-[#9a9ca5]" />
                <input name={f.name} value={values[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} placeholder={t(...f.placeholder)} className="w-full bg-transparent outline-none" />
              </label>
            );
          if (f.type === "select")
            return (
              <label key={i} className="grid gap-1 text-xs text-[#6b6e78]">
                <span className="sr-only">{t(...f.label)}</span>
                <select aria-label={t(...f.label)} className="rc-select" value={values[f.name] ?? ""} onChange={(e) => apply({ ...values, [f.name]: e.target.value })}>
                  <option value="">{t(...f.label)}: {t("All", "전체")}</option>
                  {f.options.map((o) => <option key={o.value} value={o.value}>{t(f.label[0], f.label[1])}: {t(o.en, o.ko)}</option>)}
                </select>
              </label>
            );
          if (f.type === "range")
            return (
              <label key={i} className="rc-filter-field">
                <span className="whitespace-nowrap text-xs text-[#8a8d96]">{t(...f.label)}{f.unit ? ` (${f.unit})` : ""}</span>
                <input type="number" min={0} step={f.step ?? "1"} aria-label={`${t(...f.label)} ${t("from", "최소")}`} value={values[f.name[0]] ?? ""} onChange={(e) => set(f.name[0], e.target.value)} className="w-full min-w-0 bg-transparent outline-none" />
                <span className="text-xs text-[#9a9ca5]">~</span>
                <input type="number" min={0} step={f.step ?? "1"} aria-label={`${t(...f.label)} ${t("to", "최대")}`} value={values[f.name[1]] ?? ""} onChange={(e) => set(f.name[1], e.target.value)} className="w-full min-w-0 bg-transparent outline-none" />
              </label>
            );
          if (f.type === "date")
            return (
              <label key={i} className="rc-filter-field">
                <span className="whitespace-nowrap text-xs text-[#8a8d96]">{t(...f.label)}</span>
                <input type="date" value={values[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} className="w-full bg-transparent outline-none" />
              </label>
            );
          return null;
        })}
      </div>
      {hasPeriod && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium text-[#6b6e78]">{t("Period", "기간")}</span>
          <div className="rc-segment">
            {periods.map(([v, en, ko]) => (
              <button key={v} type="button" className={(values.period || "all") === v && !values.from ? "active" : ""} onClick={() => apply({ ...values, period: v, from: "", to: "" })}>
                {t(en, ko)}
              </button>
            ))}
          </div>
          <input type="date" aria-label={t("From", "시작일")} className="rc-date" value={values.from ?? ""} onChange={(e) => set("from", e.target.value)} />
          <span className="text-xs text-[#9a9ca5]">~</span>
          <input type="date" aria-label={t("To", "종료일")} className="rc-date" value={values.to ?? ""} onChange={(e) => set("to", e.target.value)} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {exportHref && (
          <a href={`${exportHref}${exportHref.includes("?") ? "&" : "?"}${params.toString()}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#d9dbe3] bg-white px-3 text-xs font-medium hover:bg-[#f3f4f7]">
            <Download className="size-3.5" />CSV
          </a>
        )}
        <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#d9dbe3] bg-white px-3 text-xs font-medium hover:bg-[#f3f4f7]" onClick={() => { setValues({}); apply({}); }}>
          <RotateCcw className="size-3.5" />{t("Reset", "초기화")}
        </button>
        <button type="submit" disabled={pending} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#1c1d22] px-4 text-xs font-semibold text-white hover:bg-black disabled:opacity-60">
          <Search className="size-3.5" />{t("Search", "검색")}
        </button>
      </div>
    </form>
  );
}

export function Pagination({ total, page, size }: { total: number; page: number; size: number }) {
  const { t } = useLang();
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / size));
  const go = (next: Record<string, string>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) q.set(k, v);
    router.push(`${path}?${q}`);
  };
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const nums = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef0f3] px-5 py-3 text-xs text-[#6b6e78]">
      <span>{t("Total", "총")} <b className="text-[#1c1d22]">{total.toLocaleString()}</b>{t("", "건")}</span>
      <div className="flex items-center gap-1">
        <button className="rc-page" disabled={page <= 1} onClick={() => go({ page: String(page - 1) })} aria-label={t("Previous page", "이전 페이지")}><ChevronLeft className="size-4" /></button>
        {nums.map((n) => <button key={n} className={`rc-page ${n === page ? "active" : ""}`} onClick={() => go({ page: String(n) })}>{n}</button>)}
        <button className="rc-page" disabled={page >= pages} onClick={() => go({ page: String(page + 1) })} aria-label={t("Next page", "다음 페이지")}><ChevronRight className="size-4" /></button>
      </div>
      <select className="rc-select h-8 w-auto" value={size} aria-label={t("Rows per page", "페이지당 행 수")} onChange={(e) => go({ size: e.target.value, page: "1" })}>
        {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{t(`${n} per page`, `${n}개 보기`)}</option>)}
      </select>
    </div>
  );
}
