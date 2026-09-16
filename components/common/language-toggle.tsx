"use client";
import { useTransition } from "react";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setLanguage } from "@/app/actions";
import { useLang } from "./lang-provider";

export function LanguageToggle({ className }: { className?: string }) {
  const { lang } = useLang();
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" className={className} disabled={pending} onClick={() => start(() => setLanguage(lang === "en" ? "ko" : "en"))}>
      <Globe className="size-4" />
      {lang === "en" ? "한국어" : "English"}
    </Button>
  );
}
