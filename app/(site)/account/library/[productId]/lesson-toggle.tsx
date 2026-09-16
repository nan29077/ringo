"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useLang } from "@/components/common/lang-provider";
import { setLessonDone } from "../../actions";

export function LessonToggle({ productId, index, done, title }: { productId: string; index: number; done: boolean; title: string }) {
  const { t } = useLang();
  const router = useRouter();
  const [checked, setChecked] = useState(done);
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      className="size-5 shrink-0 cursor-pointer accent-[#ed4b2e]"
      checked={checked}
      disabled={pending}
      aria-label={checked ? t(`Mark “${title}” as not complete`, `“${title}” 완료 해제`) : t(`Mark “${title}” as complete`, `“${title}” 완료 표시`)}
      onChange={(e) => {
        const next = e.target.checked;
        setChecked(next);
        start(async () => {
          const r = await setLessonDone(productId, index, next);
          if (!r.ok) {
            setChecked(!next);
            toast.error(r.error);
          } else router.refresh();
        });
      }}
    />
  );
}
