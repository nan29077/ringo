export type Lang = "en" | "ko";
export type T = (en: string, ko: string) => string;
export const LANG_COOKIE = "ringo-lang";
export const makeT = (lang: Lang): T => (en, ko) => (lang === "ko" ? ko : en);

export function formatMoney(cents: number | null | undefined, currency = "USD", _lang: Lang = "en") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format((cents ?? 0) / 100);
}

export function formatDate(d: Date | string | null | undefined, lang: Lang = "en", withTime = false) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(lang === "ko" ? "ko-KR" : "en-US", {
    year: "numeric", month: "2-digit", day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
    timeZone: process.env.NEXT_PUBLIC_TIMEZONE || "Asia/Manila",
  }).format(date);
}

export const bytes = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
