import Link from "next/link";
import type { T } from "@/lib/i18n";
import { RANGE_PRESETS } from "@/lib/server/admin-catalog";

/** Range presets (7/30/90/365 days) + sub-report tabs shared by the analytics pages. */
export function AnalyticsNav({ path, days, t, extra = "" }: { path: string; days: number; t: T; extra?: string }) {
  const tabs = [
    { href: "/admin/analytics", label: t("Sales", "매출 통계") },
    { href: "/admin/analytics/products", label: t("Products", "상품 통계") },
    { href: "/admin/analytics/traffic", label: t("Traffic sources", "유입 경로") },
  ];
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[#e9ebef]">
      <nav className="rc-tabs !mb-0 !border-0">
        {tabs.map((x) => <Link key={x.href} href={`${x.href}?range=${days}`} className={x.href === path ? "active" : ""}>{x.label}</Link>)}
      </nav>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-[#6b6e78]">{t("Period", "기간")}</span>
        <div className="rc-segment">
          {RANGE_PRESETS.map((d) => (
            <Link key={d} href={`${path}?range=${d}${extra}`} className={`inline-block px-3 py-1.5 text-xs ${d === days ? "bg-[#1c1d22] text-white" : "text-[#5b5e68] hover:bg-[#f3f4f7]"}`}>
              {d === 365 ? t("1 year", "1년") : t(`${d} days`, `${d}일`)}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Single-hue share bar for ranked tables (magnitude only, value printed next to it). */
export function ShareBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full min-w-[60px] rounded-full bg-[#f0f1f4]" aria-hidden>
      <div className="h-1.5 rounded-full bg-[#3b5bdb]" style={{ width: `${pct}%` }} />
    </div>
  );
}
