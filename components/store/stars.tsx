import { Star } from "lucide-react";

/** Read-only 5 star row. `value` is 0–5 (decimals allowed). */
export function Stars({ value, size = 14, label }: { value: number; size?: number; label: string }) {
  return (
    <span className="sf-stars" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} aria-hidden fill={value >= i - 0.25 ? "currentColor" : "none"} className={value >= i - 0.25 ? "" : "opacity-40"} />
      ))}
    </span>
  );
}
