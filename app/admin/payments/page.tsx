import Link from "next/link";
import { and, count, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { likeQ, listParams, one, periodWhere, type SP } from "@/lib/server/list";
import { enumOpts, knownProviders, paymentWhere } from "@/lib/server/admin-ops";
import { formatDate, formatMoney } from "@/lib/i18n";
import { paymentStatus } from "@/lib/status";
import { PageHeader, Panel, DataTable, EmptyState, Badge, StatCard } from "@/components/console/ui";
import { FilterBar, Pagination } from "@/components/console/filters";
import { StatusBadge } from "@/components/console/status-badge";

export const metadata = { title: "Payments" };

const tabs = [
  ["attempts", "Payment attempts", "결제 시도"],
  ["events", "Webhook events", "웹훅 이벤트"],
  ["refunds", "Refunds", "환불 처리 내역"],
] as const;

export default async function AdminPayments({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = (["attempts", "events", "refunds"] as const).find((x) => x === one(sp, "tab")) ?? "attempts";
  const { page, size, offset, q } = listParams(sp);
  const { t, lang } = await getT("ko");
  const db = await getDb();
  const [providers, settings] = await Promise.all([knownProviders(db), getSettings(db)]);
  const cur = settings.site.currency;

  const tabBar = (
    <nav className="rc-tabs">
      {tabs.map(([k, en, ko]) => (
        <Link key={k} href={`/admin/payments${k === "attempts" ? "" : `?tab=${k}`}`} className={tab === k ? "active" : ""}>{t(en, ko)}</Link>
      ))}
    </nav>
  );
  const header = <PageHeader title={t("Payments", "결제 내역")} description={t("Payment attempts, provider webhooks and refund records for reconciliation with your PG.", "결제 시도, 결제사 웹훅, 환불 기록을 PG 정산 내역과 대조하세요.")} />;

  if (tab === "events") {
    const where: (SQL | undefined)[] = [periodWhere(s.paymentEvents.createdAt, sp)];
    const provider = one(sp, "provider");
    if (provider) where.push(eq(s.paymentEvents.provider, provider.slice(0, 40)));
    const st = one(sp, "state");
    if (st === "error") where.push(isNotNull(s.paymentEvents.error));
    if (st === "processed") where.push(and(isNotNull(s.paymentEvents.processedAt), isNull(s.paymentEvents.error)));
    if (st === "unprocessed") where.push(and(isNull(s.paymentEvents.processedAt), isNull(s.paymentEvents.error)));
    if (q) where.push(or(ilike(s.paymentEvents.eventId, likeQ(q)), ilike(s.paymentEvents.type, likeQ(q))));
    const cond = and(...where);
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(s.paymentEvents).where(cond).orderBy(desc(s.paymentEvents.createdAt)).limit(size).offset(offset),
      db.select({ total: count() }).from(s.paymentEvents).where(cond),
    ]);
    return (
      <>
        {header}
        {tabBar}
        <FilterBar
          fields={[
            { type: "search", name: "q", placeholder: ["Event id or type", "이벤트 ID, 유형"] },
            { type: "select", name: "provider", label: ["Provider", "결제사"], options: providers.map((p) => ({ value: p, en: p, ko: p })) },
            { type: "select", name: "state", label: ["Processing", "처리상태"], options: [{ value: "processed", en: "Processed", ko: "처리 완료" }, { value: "unprocessed", en: "Not processed", ko: "미처리" }, { value: "error", en: "Error", ko: "오류" }] },
            { type: "period" },
          ]}
        />
        <Panel title={<>{t("Webhook events", "웹훅 이벤트")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
          <DataTable
            head={[t("Received", "수신일시"), t("Provider", "결제사"), t("Event id", "이벤트 ID"), t("Type", "유형"), t("Processing", "처리"), t("Error", "오류")]}
            empty={<EmptyState title={t("No webhook events", "수신된 웹훅이 없습니다")} description={t("Events appear here when a payment provider calls /api/payments/webhook/<provider>.", "결제사가 /api/payments/webhook/<provider>를 호출하면 여기에 표시됩니다.")} />}
            footer={<Pagination total={total} page={page} size={size} />}
          >
            {rows.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap text-xs">{formatDate(e.createdAt, lang, true)}</td>
                <td className="font-medium">{e.provider}</td>
                <td className="max-w-[220px] truncate font-mono text-xs">{e.eventId}</td>
                <td className="text-xs">{e.type ?? "—"}</td>
                <td>{e.error ? <Badge tone="red">{t("Error", "오류")}</Badge> : e.processedAt ? <Badge tone="green">{t("Processed", "처리 완료")}</Badge> : <Badge tone="amber">{t("Pending", "미처리")}</Badge>}{e.processedAt && <div className="mt-0.5 text-[11px] text-[#8a8d96]">{formatDate(e.processedAt, lang, true)}</div>}</td>
                <td className="max-w-[320px] text-xs text-[#c0362c]">{e.error ?? <span className="text-[#b3b5bc]">—</span>}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      </>
    );
  }

  if (tab === "refunds") {
    const where: (SQL | undefined)[] = [periodWhere(s.refunds.createdAt, sp)];
    const st = one(sp, "rstatus");
    if (["pending", "succeeded", "failed"].includes(st)) where.push(eq(s.refunds.status, st as "pending"));
    if (q) where.push(or(ilike(s.orders.orderNo, likeQ(q)), ilike(s.refunds.providerRef, likeQ(q)), ilike(s.orders.buyerEmail, likeQ(q))));
    const cond = and(...where);
    const [rows, [{ total }]] = await Promise.all([
      db
        .select({ r: s.refunds, orderNo: s.orders.orderNo, currency: s.orders.currency, buyerEmail: s.orders.buyerEmail, provider: s.payments.provider, by: s.users.email })
        .from(s.refunds)
        .innerJoin(s.orders, eq(s.orders.id, s.refunds.orderId))
        .leftJoin(s.payments, eq(s.payments.id, s.refunds.paymentId))
        .leftJoin(s.users, eq(s.users.id, s.refunds.processedBy))
        .where(cond)
        .orderBy(desc(s.refunds.createdAt))
        .limit(size)
        .offset(offset),
      db.select({ total: count() }).from(s.refunds).innerJoin(s.orders, eq(s.orders.id, s.refunds.orderId)).where(cond),
    ]);
    return (
      <>
        {header}
        {tabBar}
        <FilterBar
          fields={[
            { type: "search", name: "q", placeholder: ["Order no., refund reference or buyer email", "주문번호, 환불 거래번호, 구매자 이메일"] },
            { type: "select", name: "rstatus", label: ["Status", "상태"], options: [{ value: "succeeded", en: "Succeeded", ko: "성공" }, { value: "failed", en: "Failed", ko: "실패" }, { value: "pending", en: "Pending", ko: "대기" }] },
            { type: "period" },
          ]}
        />
        <Panel title={<>{t("Refund records", "환불 처리 내역")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
          <DataTable
            head={[t("Created", "처리일시"), t("Order", "주문번호"), t("Provider", "결제사"), t("Amount", "금액"), t("Status", "상태"), t("Reason", "사유"), t("Reference", "환불 거래번호"), t("Processed by", "처리자")]}
            empty={<EmptyState title={t("No refunds", "환불 기록이 없습니다")} />}
            footer={<Pagination total={total} page={page} size={size} />}
          >
            {rows.map(({ r, orderNo, currency, buyerEmail, provider, by }) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-xs">{formatDate(r.createdAt, lang, true)}</td>
                <td className="whitespace-nowrap"><Link href={`/admin/orders/${r.orderId}`} className="font-semibold text-[#2f4ac2] hover:underline">{orderNo}</Link><div className="text-[11px] text-[#8a8d96]">{buyerEmail}</div></td>
                <td className="text-xs">{provider ?? "—"}{r.reason?.startsWith("[manual]") && <div><Badge tone="violet">{t("Manual", "수동")}</Badge></div>}</td>
                <td className="whitespace-nowrap font-medium">{formatMoney(r.amountCents, currency, lang)}</td>
                <td><Badge tone={r.status === "succeeded" ? "green" : r.status === "failed" ? "red" : "amber"}>{r.status === "succeeded" ? t("Succeeded", "성공") : r.status === "failed" ? t("Failed", "실패") : t("Pending", "대기")}</Badge></td>
                <td className="max-w-[260px] text-xs">{r.reason ?? "—"}</td>
                <td className="max-w-[160px] truncate font-mono text-xs">{r.providerRef ?? "—"}</td>
                <td className="text-xs">{by ?? "—"}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      </>
    );
  }

  const cond = paymentWhere(sp);
  const statusless = paymentWhere({ ...sp, status: "" });
  const [rows, [{ total }], byStatus] = await Promise.all([
    db
      .select({ p: s.payments, orderNo: s.orders.orderNo, buyerEmail: s.orders.buyerEmail, orderStatus: s.orders.status })
      .from(s.payments)
      .innerJoin(s.orders, eq(s.orders.id, s.payments.orderId))
      .where(cond)
      .orderBy(desc(s.payments.createdAt))
      .limit(size)
      .offset(offset),
    db.select({ total: count() }).from(s.payments).innerJoin(s.orders, eq(s.orders.id, s.payments.orderId)).where(cond),
    db
      .select({ status: s.payments.status, n: sql<number>`count(*)::int`, cents: sql<number>`coalesce(sum(${s.payments.amountCents}),0)::int` })
      .from(s.payments)
      .innerJoin(s.orders, eq(s.orders.id, s.payments.orderId))
      .where(statusless)
      .groupBy(s.payments.status),
  ]);
  const stat = (k: string) => byStatus.find((x) => x.status === k) ?? { n: 0, cents: 0 };

  return (
    <>
      {header}
      {tabBar}
      <FilterBar
        fields={[
          { type: "search", name: "q", placeholder: ["Order no., provider reference or buyer email", "주문번호, 결제사 거래번호, 구매자 이메일"] },
          { type: "select", name: "provider", label: ["Provider", "결제사"], options: providers.map((p) => ({ value: p, en: p, ko: p })) },
          { type: "select", name: "status", label: ["Status", "결제상태"], options: enumOpts(paymentStatus) },
          { type: "period" },
        ]}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {(["succeeded", "pending", "failed", "cancelled", "refunded"] as const).map((k) => (
          <StatCard key={k} label={t(paymentStatus[k].en, paymentStatus[k].ko)} value={formatMoney(stat(k).cents, cur, lang)} hint={t(`${stat(k).n} attempts`, `${stat(k).n}건`)} tone={k === "succeeded" ? "good" : k === "failed" && stat(k).n ? "warn" : "default"} />
        ))}
      </div>
      <Panel title={<>{t("Payment attempts", "결제 시도")} <span className="ml-1 text-[#8a8d96]">{total}</span></>} bodyClass="p-0">
        <DataTable
          head={[t("Created", "생성일시"), t("Order", "주문번호"), t("Provider", "결제사"), t("Reference", "거래 번호"), t("Method", "수단"), t("Amount", "금액"), t("Status", "상태"), t("Failure reason", "실패 사유"), t("Updated", "갱신")]}
          empty={<EmptyState title={t("No payments match these filters.", "조건에 맞는 결제 내역이 없습니다.")} />}
          footer={<Pagination total={total} page={page} size={size} />}
        >
          {rows.map(({ p, orderNo, buyerEmail }) => (
            <tr key={p.id}>
              <td className="whitespace-nowrap text-xs">{formatDate(p.createdAt, lang, true)}</td>
              <td className="whitespace-nowrap"><Link href={`/admin/orders/${p.orderId}`} className="font-semibold text-[#2f4ac2] hover:underline">{orderNo}</Link><div className="text-[11px] text-[#8a8d96]">{buyerEmail}</div></td>
              <td className="font-medium">{p.provider}</td>
              <td className="max-w-[180px] truncate font-mono text-xs">{p.providerRef ?? "—"}</td>
              <td className="text-xs">{p.method ?? "—"}</td>
              <td className="whitespace-nowrap font-medium">{formatMoney(p.amountCents, p.currency, lang)}</td>
              <td><StatusBadge map={paymentStatus} value={p.status} lang={lang} /></td>
              <td className="max-w-[240px] text-xs text-[#c0362c]">{p.failureReason ?? <span className="text-[#b3b5bc]">—</span>}</td>
              <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(p.updatedAt, lang, true)}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </>
  );
}
