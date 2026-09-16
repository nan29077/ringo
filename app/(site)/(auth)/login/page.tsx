import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getViewer } from "@/lib/server/auth";
import { getT } from "@/lib/server/i18n-server";
import { ActionForm } from "@/components/common/action-form";
import { AuthCard, AuthInput, SubmitButton } from "../auth-card";
import { login } from "../actions";
import { DemoLoginButtons } from "../demo-login-buttons";
import { demoLoginEnabled } from "@/lib/server/demo-login";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const viewer = await getViewer();
  const { t } = await getT();
  if (viewer) redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : viewer.user.role === "admin" ? "/admin" : viewer.user.role === "seller" ? "/seller" : "/account");
  return (
    <AuthCard
      title={t("Welcome back.", "다시 만나 반가워요.")}
      subtitle={t("Log in to your library, orders and workspace.", "라이브러리, 주문, 작업 공간에 로그인하세요.")}
      footer={<>{t("New to Ringo?", "링고가 처음인가요?")} <Link className="font-semibold text-[#ed4b2e]" href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}>{t("Create an account", "회원가입")}</Link></>}
    >
      <div className="mb-5 grid gap-2.5">
        <button disabled className="flex h-11 items-center gap-3 rounded-lg border border-[#e4e3de] px-4 text-sm text-[#55574f] opacity-70"><b className="text-lg text-[#4285f4]">G</b>{t("Continue with Google", "Google로 계속하기")}<small className="ml-auto text-[11px]">{t("Coming soon", "연동 예정")}</small></button>
        <button disabled className="flex h-11 items-center gap-3 rounded-lg border border-[#e4e3de] px-4 text-sm text-[#55574f] opacity-70"><b className="text-lg text-[#1877f2]">f</b>{t("Continue with Facebook", "Facebook으로 계속하기")}<small className="ml-auto text-[11px]">{t("Coming soon", "연동 예정")}</small></button>
      </div>
      <div className="auth-divider mb-5"><span>{t("or with email", "또는 이메일")}</span></div>
      <ActionForm action={login} className="grid gap-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <AuthInput label={t("Email", "이메일")} name="email" type="email" autoComplete="email" required />
        <AuthInput label={t("Password", "비밀번호")} name="password" type="password" autoComplete="current-password" required />
        <div className="-mt-1 text-right text-xs"><Link href="/forgot-password" className="text-[#6f716a] underline-offset-2 hover:underline">{t("Forgot password?", "비밀번호를 잊으셨나요?")}</Link></div>
        <SubmitButton>{t("Log in", "로그인")}</SubmitButton>
      </ActionForm>
      {demoLoginEnabled() && <DemoLoginButtons next={next} />}
    </AuthCard>
  );
}
