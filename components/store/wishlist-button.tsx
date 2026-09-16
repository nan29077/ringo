"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/components/common/lang-provider";
import { toggleWishlist } from "@/app/(site)/store-actions";

/** Heart toggle. Logged-out visitors are sent to log in and come back to `next`. */
export function WishlistButton({ productId, saved, signedIn, next, className = "favorite", withLabel = false }: { productId: string; saved: boolean; signedIn: boolean; next: string; className?: string; withLabel?: boolean }) {
  const { t } = useLang();
  const router = useRouter();
  const [on, setOn] = useState(saved);
  const [pending, start] = useTransition();
  const label = on ? t("Remove from wishlist", "관심 상품 해제") : t("Save to wishlist", "관심 상품 저장");
  const inner = (
    <>
      <Heart size={18} aria-hidden />
      {withLabel && <span>{on ? t("Saved", "저장됨") : t("Save", "저장")}</span>}
    </>
  );
  if (!signedIn) {
    return <Link href={`/login?next=${encodeURIComponent(next)}`} className={className} aria-label={label} title={label}>{inner}</Link>;
  }
  return (
    <button
      type="button"
      className={`${className} ${on ? "saved" : ""}`}
      aria-label={label}
      title={label}
      aria-pressed={on}
      disabled={pending}
      onClick={() => {
        const prev = on;
        setOn(!prev);
        start(async () => {
          const r = await toggleWishlist(productId);
          if (!r.ok) {
            setOn(prev);
            toast.error(r.error);
            return;
          }
          toast.success(r.message);
          router.refresh();
        });
      }}
    >
      {inner}
    </button>
  );
}
