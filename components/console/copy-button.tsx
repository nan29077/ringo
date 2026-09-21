"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { useLang } from "@/components/common/lang-provider";

/** Copies a value (e.g. a sales link URL) to the clipboard. */
export function CopyButton({ value, label, className = "" }: { value: string; label?: string; className?: string }) {
  const { t } = useLang();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`rc-btn rc-btn-outline rc-btn-sm ${className}`}
      aria-label={label ? undefined : t(`Copy ${value}`, `${value} 복사`)}
      title={t("Copy", "복사")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          toast.success(t("Copied", "복사했습니다"));
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error(t("Could not copy. Select the text and copy it manually.", "복사하지 못했습니다. 직접 선택해 복사하세요."));
        }
      }}
    >
      {done ? <Check /> : <Copy />}
      {label}
    </button>
  );
}
