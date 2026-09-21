import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { LANG_COOKIE, makeT, type Lang } from "../i18n";
import { getDb } from "./db";
import { getSettings } from "./settings";

/** Shop-wide settings for the storefront chrome, read once per request. */
const siteSettings = cache(async () => {
  try {
    return (await getSettings(await getDb())).site;
  } catch {
    return null;
  }
});

/** The shop name from Preferences (falls back to "Ringo"). */
export async function siteName() {
  return (await siteSettings())?.name?.trim() || "Ringo";
}

/** The business details from Preferences, shown in the store footer. */
export async function siteBusinessInfo() {
  return (await siteSettings())?.businessInfo?.trim() || "";
}

/** The storefront language an operator picked in Preferences, read once per request. */
export const storeDefaultLang = cache(async (): Promise<Lang> => ((await siteSettings())?.defaultLocale === "ko" ? "ko" : "en"));

/**
 * The visitor's chosen language (cookie) wins. Without one, a caller that knows its audience passes a
 * fallback — the consoles pass "ko" — and everything else follows the store's default language from
 * Preferences, which used to be saved but never applied.
 */
export async function getLang(fallback?: Lang): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  if (v === "ko" || v === "en") return v;
  return fallback ?? (await storeDefaultLang());
}

export async function getT(fallback?: Lang) {
  const lang = await getLang(fallback);
  return { lang, t: makeT(lang) };
}
