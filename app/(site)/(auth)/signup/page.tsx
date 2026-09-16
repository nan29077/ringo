import Link from "next/link";
import type { Metadata } from "next";
import { getT } from "@/lib/server/i18n-server";
import { ActionForm } from "@/components/common/action-form";
import { AuthCard, AuthInput, SubmitButton } from "../auth-card";
import { signup } from "../actions";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const { t } = await getT();
  return (
    <AuthCard
      title={t("Make room for your next idea.", "다음 아이디어를 위한 시작.")}
      subtitle={t("Create a free account to buy, keep and download digital goods.", "무료 계정으로 디지털 콘텐츠를 구매하고 보관하세요.")}
      footer={<>{t("Already have an account?", "이미 계정이 있나요?")} <Link className="font-semibold text-[#ed4b2e]" href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}>{t("Log in", "로그인")}</Link></>}
    >
      <ActionForm action={signup} className="grid gap-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <AuthInput label={t("Name", "이름")} name="name" autoComplete="name" required maxLength={80} />
        <AuthInput label={t("Email", "이메일")} name="email" type="email" autoComplete="email" required />
        <AuthInput label={t("Password (8+ with letters & numbers)", "비밀번호 (영문·숫자 포함 8자 이상)")} name="password" type="password" autoComplete="new-password" required minLength={8} />
        <label className="flex items-start gap-2 text-xs leading-relaxed text-[#55574f]"><input type="checkbox" name="terms" required className="mt-0.5" /><span>{t("I agree to the ", "")}<Link href="/terms" target="_blank" className="underline underline-offset-2">{t("Terms of Service", "이용약관")}</Link>{t(" and ", " 및 ")}<Link href="/privacy" target="_blank" className="underline underline-offset-2">{t("Privacy Policy", "개인정보 처리방침")}</Link>{t(".", "에 동의합니다.")}</span></label>
        <label className="-mt-2 flex items-start gap-2 text-xs leading-relaxed text-[#55574f]"><input type="checkbox" name="marketing" className="mt-0.5" />{t("Send me new releases and offers (optional).", "신규 콘텐츠와 혜택 소식 받기 (선택)")}</label>
        <SubmitButton>{t("Create account", "계정 만들기")}</SubmitButton>
      </ActionForm>
    </AuthCard>
  );
}
