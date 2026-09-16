import { Badge } from "./ui";
import type { Lang } from "@/lib/i18n";

export function StatusBadge({ map, value, lang }: { map: Record<string, { en: string; ko: string; tone: string }>; value: string | null | undefined; lang: Lang }) {
  const e = value ? map[value] : undefined;
  if (!e) return <Badge>{value ?? "—"}</Badge>;
  return <Badge tone={e.tone}>{lang === "ko" ? e.ko : e.en}</Badge>;
}
