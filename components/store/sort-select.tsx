"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useLang } from "@/components/common/lang-provider";

/** Catalog sort dropdown — updates the `sort` URL param (server re-renders the list). */
export function SortSelect({ value }: { value: string }) {
  const { t } = useLang();
  const router = useRouter();
  const sp = useSearchParams();
  const options: [string, string][] = [
    ["featured", t("Recommended", "추천순")],
    ["newest", t("Newest", "최신순")],
    ["popular", t("Most popular", "인기순")],
    ["price-low", t("Price: low to high", "가격 낮은 순")],
    ["price-high", t("Price: high to low", "가격 높은 순")],
  ];
  return (
    <label className="sf-sort">
      <span className="sr-only">{t("Sort products", "상품 정렬")}</span>
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(sp.toString());
          if (e.target.value === "featured") next.delete("sort");
          else next.set("sort", e.target.value);
          next.delete("page");
          const qs = next.toString();
          router.push(`/${qs ? `?${qs}` : ""}#catalog`, { scroll: false });
        }}
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
