import Link from "next/link";
import { getT } from "@/lib/server/i18n-server";
import { AuthCard } from "../auth-card";
import { verifyEmailToken } from "../actions";

export const metadata = { title: "Verify email", robots: { index: false } };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const { t } = await getT();
  const result = token ? await verifyEmailToken(token) : "invalid";
  const title = result === "invalid" ? t("Link expired", "만료된 링크") : t("Email verified", "이메일 인증 완료");
  const subtitle =
    result === "verified" ? t("Thanks! Your email address is confirmed.", "이메일 주소가 확인되었습니다.")
    : result === "already" ? t("This address was already verified — nothing else to do.", "이미 인증이 완료된 주소입니다. 추가로 하실 일은 없습니다.")
    : t("This verification link is invalid or has expired. Request a new one from your account.", "유효하지 않거나 만료된 링크입니다. 내 계정에서 인증 메일을 다시 요청하세요.");
  return (
    <AuthCard title={title} subtitle={subtitle}>
      <Link href="/account" className="flex h-12 items-center justify-center rounded-lg bg-[#ed4b2e] font-semibold text-white">{t("Go to my account", "내 계정으로")}</Link>
    </AuthCard>
  );
}
