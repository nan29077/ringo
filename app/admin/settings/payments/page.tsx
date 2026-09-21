import Link from "next/link";
import { CheckCircle2, CircleAlert, XCircle } from "lucide-react";
import { requireAdmin } from "@/lib/server/auth";
import { getDb, databaseDriver } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { providerStatus } from "@/lib/server/payments";
import { storageDriverName } from "@/lib/server/storage";
import { appOrigin } from "@/lib/server/request";
import { PageHeader, Panel, DataTable, Badge, Notice } from "@/components/console/ui";
import { ActionButton } from "@/components/common/action-form";
import { CopyButton } from "@/components/console/copy-button";
import { adminSetProvider } from "../actions";

export const metadata = { title: "Payment setup" };

const ENV_KEYS = ["API_BASE_URL", "MERCHANT_ID", "API_KEY", "WEBHOOK_SECRET", "IMPLEMENTED"];

function Check({ ok, warn }: { ok: boolean; warn?: boolean }) {
  if (ok) return <CheckCircle2 className="size-4 text-[#16794a]" />;
  return warn ? <CircleAlert className="size-4 text-[#a45c00]" /> : <XCircle className="size-4 text-[#c0362c]" />;
}

export default async function AdminPaymentSettings() {
  await requireAdmin();
  const db = await getDb();
  const { t } = await getT("ko");
  const [settings, origin] = await Promise.all([getSettings(db), appOrigin()]);
  const providers = providerStatus();
  const enabled = settings.payments.enabledProviders;
  const production = process.env.NODE_ENV === "production";
  const usable = providers.filter((p) => p.available && enabled.includes(p.id));
  const onlyTest = usable.length > 0 && usable.every((p) => p.id === "test");
  const smtp = !!process.env.SMTP_HOST;
  const appUrl = process.env.APP_URL;
  const db_ = databaseDriver();
  const storage = storageDriverName();

  const system: { label: string; value: string; ok: boolean; hint: string }[] = [
    { label: t("Database", "데이터베이스"), value: db_ === "postgres" ? "PostgreSQL (DATABASE_URL)" : "PGlite (embedded, .data/pglite)", ok: db_ === "postgres", hint: db_ === "postgres" ? t("Connected via DATABASE_URL.", "DATABASE_URL로 연결되어 있습니다.") : t("Embedded database for local development. Set DATABASE_URL (RDS/Aurora) in production.", "로컬 개발용 내장 DB입니다. 운영 환경에서는 DATABASE_URL(RDS/Aurora)을 설정하세요.") },
    { label: t("File storage", "파일 저장소"), value: storage === "s3" ? `Amazon S3 (${process.env.S3_BUCKET})` : "Local disk (.data/uploads)", ok: storage === "s3", hint: storage === "s3" ? t("Uploads are stored in S3 with server-side encryption.", "업로드 파일이 S3에 암호화 저장됩니다.") : t("Files are stored on the server disk. Set S3_BUCKET for multi-instance deployments.", "파일이 서버 디스크에 저장됩니다. 다중 서버 운영 시 S3_BUCKET을 설정하세요.") },
    { label: t("Email", "메일 발송"), value: smtp ? `SMTP (${process.env.SMTP_HOST})` : t("Not configured — logged only", "미설정 — 기록만 됨"), ok: smtp, hint: smtp ? t("Emails are delivered via SMTP.", "SMTP로 메일이 발송됩니다.") : t("Set SMTP_HOST / SMTP_USER / SMTP_PASS / MAIL_FROM. Until then emails only appear in the email log.", "SMTP_HOST / SMTP_USER / SMTP_PASS / MAIL_FROM을 설정하세요. 설정 전까지 메일은 발송 내역에만 기록됩니다.") },
    { label: "APP_URL", value: appUrl ?? t("Not set", "미설정"), ok: !!appUrl, hint: appUrl ? t("Used for links in emails, sales links and PG callbacks.", "메일 링크, 판매 링크, PG 콜백 주소에 사용됩니다.") : t(`Falling back to the request host (${origin}). Set APP_URL to the public https origin in production.`, `요청 호스트(${origin})를 사용 중입니다. 운영 환경에서는 공개 https 주소를 APP_URL로 설정하세요.`) },
  ];

  return (
    <>
      <PageHeader title={t("Payment setup", "결제 서비스 설정")} description={t("Which payment methods buyers can use at checkout, PG credentials and system status.", "구매자가 결제 시 사용할 수 있는 결제 수단, PG 연동 정보, 시스템 상태를 확인합니다.")} crumbs={[{ href: "/admin/settings", label: t("Basic settings", "기본 설정") }, { label: t("Payment setup", "결제 서비스 설정") }]} />

      <div className="mb-4 grid gap-2">
        {usable.length === 0 && <Notice tone="danger">{t("No payment method is available at checkout. Buyers cannot pay until a provider is both available and enabled.", "사용 가능한 결제 수단이 없습니다. 결제사가 연동되고 사용 설정되기 전까지 구매자는 결제할 수 없습니다.")}</Notice>}
        {onlyTest && <Notice tone="warn">{t("Test mode: only the sandbox provider is active. Orders are marked paid without moving money — do not use with real customers.", "테스트 모드: 샌드박스 결제만 활성화되어 있습니다. 실제 돈이 오가지 않고 결제 완료 처리되므로 실제 고객에게 사용하지 마세요.")}</Notice>}
        {providers.some((p) => p.id === "test" && p.available) && production && <Notice tone="danger">{t("PAYMENT_TEST_MODE is enabled in production.", "운영 환경에서 PAYMENT_TEST_MODE가 켜져 있습니다.")}</Notice>}
      </div>

      <Panel title={t("Providers", "결제사")} bodyClass="p-0" className="mb-4">
        <DataTable head={[t("Provider", "결제사"), t("Integration", "연동 상태"), t("Checkout", "결제 사용"), t("Webhook URL (register with the PG)", "웹훅 URL (PG사에 등록)"), ""]}>
          {providers.map((p) => {
            const on = enabled.includes(p.id);
            const webhook = p.id === "test" ? null : `${origin}/api/payments/webhook/${p.id}`;
            return (
              <tr key={p.id}>
                <td><div className="font-semibold">{p.label}</div><code className="text-[11px] text-[#8a8d96]">{p.id}</code></td>
                <td className="max-w-[320px]">
                  {p.available ? <Badge tone="green">{t("Available", "연동 완료")}</Badge> : <Badge tone="red">{t("Unavailable", "사용 불가")}</Badge>}
                  {p.reason && <div className="mt-1 text-[11px] leading-snug text-[#6b6e78]">{p.reason}</div>}
                </td>
                <td>{on && p.available ? <Badge tone="green">{t("Enabled", "사용중")}</Badge> : on ? <Badge tone="amber">{t("Enabled · not available", "사용 설정 · 연동 안 됨")}</Badge> : <Badge>{t("Disabled", "미사용")}</Badge>}</td>
                <td>
                  {webhook ? (
                    <div className="flex items-center gap-1.5">
                      <code className="max-w-[300px] truncate rounded bg-[#f3f4f7] px-1.5 py-0.5 text-[11px]">{webhook}</code>
                      <CopyButton value={webhook} className="!h-6 !px-1.5" />
                    </div>
                  ) : <span className="text-xs text-[#8a8d96]">{t("No webhook (sandbox)", "웹훅 없음 (샌드박스)")}</span>}
                </td>
                <td className="whitespace-nowrap text-right">
                  {on ? (
                    <ActionButton action={adminSetProvider.bind(null, p.id, false)} confirm={t(`Disable ${p.label} at checkout?`, `${p.label} 결제를 중지할까요?`)}>{t("Disable", "사용 중지")}</ActionButton>
                  ) : (
                    <span title={p.available ? undefined : t("Complete the integration first", "먼저 연동을 완료하세요")}>
                      {p.available ? <ActionButton action={adminSetProvider.bind(null, p.id, true)}>{t("Enable", "사용")}</ActionButton> : <button className="rc-btn rc-btn-outline rc-btn-sm" disabled>{t("Enable", "사용")}</button>}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </DataTable>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={t("Environment checklist", "환경 변수 체크리스트")} description={t("Values are never shown; only whether they are set. Configure them on the server and restart.", "값은 표시하지 않고 설정 여부만 보여줍니다. 서버에 설정한 뒤 재시작하세요.")} bodyClass="p-0">
          <DataTable head={[t("Variable", "변수"), "PearPay", "NextPay"]}>
            {ENV_KEYS.map((k) => (
              <tr key={k}>
                <td><code className="text-xs">&lt;PG&gt;_{k}</code>{k === "IMPLEMENTED" && <div className="text-[11px] text-[#8a8d96]">{t("Set to true after wiring the API calls from the PG spec", "PG 연동 규격에 맞게 API 호출 구현 후 true")}</div>}</td>
                {(["PEARPAY", "NEXTPAY"] as const).map((pg) => {
                  const v = process.env[`${pg}_${k}`];
                  const ok = k === "IMPLEMENTED" ? v === "true" : !!v;
                  return <td key={pg}><span className="inline-flex items-center gap-1.5 text-xs"><Check ok={ok} />{ok ? t("Set", "설정됨") : t("Missing", "없음")}</span></td>;
                })}
              </tr>
            ))}
          </DataTable>
        </Panel>
        <Panel title={t("System status", "시스템 상태")} bodyClass="p-0">
          <DataTable head={[t("Component", "항목"), t("Status", "상태")]}>
            {system.map((x) => (
              <tr key={x.label}>
                <td className="whitespace-nowrap font-medium">{x.label}</td>
                <td>
                  <div className="flex items-center gap-1.5 text-sm"><Check ok={x.ok} warn={!production} /><span>{x.value}</span></div>
                  <div className="mt-0.5 text-[11px] text-[#6b6e78]">{x.hint}</div>
                </td>
              </tr>
            ))}
            <tr>
              <td className="whitespace-nowrap font-medium">NODE_ENV</td>
              <td><code className="text-xs">{process.env.NODE_ENV}</code> · <Link href="/api/health" target="_blank" className="text-xs text-[#2f4ac2] hover:underline">/api/health</Link></td>
            </tr>
          </DataTable>
        </Panel>
      </div>
    </>
  );
}
