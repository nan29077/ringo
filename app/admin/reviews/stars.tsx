import { Star } from "lucide-react";

export function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex" aria-label={`${n} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`size-3.5 ${i <= n ? "fill-[#f5a623] text-[#f5a623]" : "text-[#d9dbe3]"}`} />)}
    </span>
  );
}
