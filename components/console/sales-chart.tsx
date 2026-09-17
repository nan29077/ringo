"use client";
import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/i18n";
import { useLang } from "@/components/common/lang-provider";

export type SalesPoint = { date: string; cents: number; orders: number };

/**
 * Single-series daily sales: thin rounded bars, recessive grid, hover tooltip (no legend needed).
 *
 * The width is measured here rather than with Recharts' ResponsiveContainer, which renders once at
 * width -1 (before its own effect measures the box) and logs a "width(-1)" warning on every page.
 */
export function SalesChart({ data, currency, color = "#3b5bdb", height = 240 }: { data: SalesPoint[]; currency: string; color?: string; height?: number }) {
  const { t, lang } = useLang();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // ResizeObserver reports the current size as soon as it starts observing, so no initial setState here.
    const observer = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const max = data.reduce((a, p) => Math.max(a, p.cents), 0);
  if (!max) {
    return (
      <div style={{ height }} className="flex items-center justify-center rounded-lg border border-dashed border-[#e1e3e8] text-sm text-[#8a8d96]">
        {t("No sales in this period yet.", "이 기간에는 매출이 없습니다.")}
      </div>
    );
  }
  return (
    <div ref={box} style={{ height }} role="img" aria-label={t("Daily sales chart", "일별 매출 차트")}>
      {width > 0 && (
        <BarChart width={width} height={height} data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="#eef0f3" />
          <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: "#e1e3e8" }} tick={{ fontSize: 11, fill: "#8a8d96" }} tickFormatter={(d: string) => d.slice(5)} interval="preserveStartEnd" minTickGap={18} />
          <YAxis tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11, fill: "#8a8d96" }} domain={[0, "auto"]} allowDecimals={false} tickFormatter={(v: number) => formatMoney(v, currency, lang).replace(/\.00$/, "")} />
          <Tooltip
            cursor={{ fill: "#1c1d220a" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as SalesPoint;
              return (
                <div className="rounded-lg border border-[#e1e3e8] bg-white px-3 py-2 text-xs shadow-lg">
                  <div className="font-semibold text-[#1c1d22]">{p.date}</div>
                  <div className="mt-1 text-[#3b3d46]">{t("Sales", "매출")}: <b>{formatMoney(p.cents, currency, lang)}</b></div>
                  <div className="text-[#6b6e78]">{t("Orders", "주문")}: {p.orders}</div>
                </div>
              );
            }}
          />
          <Bar dataKey="cents" fill={color} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      )}
    </div>
  );
}
