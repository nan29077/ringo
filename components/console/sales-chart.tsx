"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/i18n";
import { useLang } from "@/components/common/lang-provider";

export type SalesPoint = { date: string; cents: number; orders: number };

/** Single-series daily sales: thin rounded bars, recessive grid, hover tooltip (no legend needed). */
export function SalesChart({ data, currency, color = "#3b5bdb", height = 240 }: { data: SalesPoint[]; currency: string; color?: string; height?: number }) {
  const { t, lang } = useLang();
  return (
    <div style={{ height }} role="img" aria-label={t("Daily sales chart", "일별 매출 차트")}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="#eef0f3" />
          <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: "#e1e3e8" }} tick={{ fontSize: 11, fill: "#8a8d96" }} tickFormatter={(d: string) => d.slice(5)} interval="preserveStartEnd" minTickGap={18} />
          <YAxis tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11, fill: "#8a8d96" }} tickFormatter={(v: number) => formatMoney(v, currency, lang).replace(/\.00$/, "")} />
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
      </ResponsiveContainer>
    </div>
  );
}
