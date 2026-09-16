import "server-only";
import { cookies } from "next/headers";
import { LANG_COOKIE, makeT, type Lang } from "../i18n";

export async function getLang(fallback: Lang = "en"): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return v === "ko" || v === "en" ? v : fallback;
}

export async function getT(fallback: Lang = "en") {
  const lang = await getLang(fallback);
  return { lang, t: makeT(lang) };
}
