"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { LANG_COOKIE } from "@/lib/i18n";
import { destroySession } from "@/lib/server/auth";

export async function setLanguage(lang: "en" | "ko") {
  (await cookies()).set(LANG_COOKIE, lang === "ko" ? "ko" : "en", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function signOut() {
  await destroySession();
  redirect("/");
}
