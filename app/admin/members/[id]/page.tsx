import Link from "next/link";
import { notFound } from "next/navigation";
import { and, count, desc, eq, gt, ne, sql } from "drizzle-orm";
import { KeyRound, LogOut, MailCheck } from "lucide-react";
import * as s from "@/db/schema";
import { requireAdmin } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { getT } from "@/lib/server/i18n-server";
import { getSettings } from "@/lib/server/settings";
import { isUuid } from "@/lib/server/seller-center";
import { formatDate, formatMoney } from "@/lib/i18n";
import { fulfillmentStatus, inquiryStatus, orderStatus, refundStatus, roleLabel, sellerStatus, userStatus } from "@/lib/status";
import { PageHeader, Panel, DetailList, DataTable, EmptyState, Badge, Notice, StatCard } from "@/components/console/ui";
import { StatusBadge } from "@/components/console/status-badge";
import { ActionButton, ActionForm } from "@/components/common/action-form";
import { forceSignOut, grantMemberEntitlement, markEmailVerified, revokeMemberEntitlement, saveMemberMemo, sendMemberPasswordReset, setMemberStatus } from "../actions";

export const metadata = { title: "Member" };

export default async function AdminMemberDetail({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const { t, lang } = await getT("ko");
  const [user] = await db.select().from(s.users).where(eq(s.users.id, id));
  if (!user) notFound();

  const [seller, orders, [orderAgg], entitlements, inquiries, sessions, products, settings] = await Promise.all([
    db.select().from(s.sellers).where(eq(s.sellers.userId, id)).then((r) => r[0]),
    db.select({ o: s.orders, seller: s.sellers.displayName }).from(s.orders).innerJoin(s.sellers, eq(s.sellers.id, s.orders.sellerId)).where(eq(s.orders.buyerId, id)).orderBy(desc(s.orders.createdAt)).limit(15),
    db
      .select({
        total: count(),
        paidN: sql<number>`count(*) filter (where ${s.orders.status} = 'paid')::int`,
        paidCents: sql<number>`coalesce(sum(${s.orders.totalCents}) filter (where ${s.orders.status} = 'paid'),0)::int`,
        refundedCents: sql<number>`coalesce(sum(${s.orders.refundedCents}),0)::int`,
      })
      .from(s.orders)
      .where(eq(s.orders.buyerId, id)),
    db
      .select({ e: s.entitlements, title: lang === "ko" ? s.products.titleKo : s.products.titleEn, orderNo: s.orders.orderNo, source: s.orders.source })
      .from(s.entitlements)
      .innerJoin(s.products, eq(s.products.id, s.entitlements.productId))
      .innerJoin(s.orders, eq(s.orders.id, s.entitlements.orderId))
      .where(eq(s.entitlements.userId, id))
      .orderBy(desc(s.entitlements.createdAt))
      .limit(100),
    db.select({ i: s.inquiries, store: s.sellers.displayName }).from(s.inquiries).leftJoin(s.sellers, eq(s.sellers.id, s.inquiries.sellerId)).where(eq(s.inquiries.userId, id)).orderBy(desc(s.inquiries.updatedAt)).limit(20),
    db.select().from(s.sessions).where(and(eq(s.sessions.userId, id), gt(s.sessions.expiresAt, new Date()))).orderBy(desc(s.sessions.lastSeenAt)),
    db
      .select({ id: s.products.id, title: lang === "ko" ? s.products.titleKo : s.products.titleEn, seller: s.sellers.displayName, status: s.products.status })
      .from(s.products)
      .innerJoin(s.sellers, eq(s.sellers.id, s.products.sellerId))
      .where(and(ne(s.products.deliveryType, "service"), ne(s.products.status, "archived")))
      .orderBy(s.sellers.displayName, s.products.titleEn)
      .limit(1000),
    getSettings(db),
  ]);
  const self = user.id === viewer.user.id;
  const cur = settings.site.currency;
  const activeEnt = new Set(entitlements.filter((x) => x.e.status === "active").map((x) => x.e.productId));

  return (
    <>
      <PageHeader
        title={user.name}
        description={user.email}
        crumbs={[{ href: "/admin/members", label: t("Members", "회원 관리") }, { label: user.name }]}
        actions={
          <>
            <StatusBadge map={roleLabel} value={user.role} lang={lang} />
            <StatusBadge map={userStatus} value={user.status} lang={lang} />
            {!user.emailVerifiedAt && <ActionButton action={markEmailVerified.bind(null, user.id)} confirm={t("Mark this email address as verified?", "이메일 인증 완료로 처리할까요?")}><MailCheck />{t("Mark verified", "인증 처리")}</ActionButton>}
            <ActionButton action={sendMemberPasswordReset.bind(null, user.id)} confirm={t(`Send a password reset link to ${user.email}?`, `${user.email}로 비밀번호 재설정 링크를 보낼까요?`)}><KeyRound />{t("Send reset link", "비밀번호 재설정 메일")}</ActionButton>
            <ActionButton action={forceSignOut.bind(null, user.id)} confirm={t("Sign this member out of all sessions?", "이 회원의 모든 세션을 로그아웃시킬까요?")}><LogOut />{t("Sign out everywhere", "전체 로그아웃")}</ActionButton>
          </>
        }
      />

      {user.status !== "active" && <div className="mb-4"><Notice tone="danger">{t("This account is suspended. The member cannot sign in.", "이용이 정지된 계정입니다. 로그인할 수 없습니다.")}</Notice></div>}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("Orders", "전체 주문")} value={orderAgg.total} hint={t(`${orderAgg.paidN} currently paid`, `결제 완료 ${orderAgg.paidN}건`)} href={`/admin/orders?buyer=${user.id}`} />
        <StatCard label={t("Paid total", "결제 금액")} value={formatMoney(orderAgg.paidCents, cur, lang)} tone="good" />
        <StatCard label={t("Refunded", "환불 금액")} value={formatMoney(orderAgg.refundedCents, cur, lang)} />
        <StatCard label={t("Library items", "보유 상품")} value={activeEnt.size} hint={t(`${sessions.length} active sessions`, `활성 세션 ${sessions.length}개`)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="grid min-w-0 content-start gap-4">
          <Panel title={t("Recent orders", "최근 주문")} bodyClass="p-0" actions={<Link href={`/admin/orders?buyer=${user.id}`} className="rc-btn rc-btn-outline rc-btn-sm">{t("All orders", "전체 보기")}</Link>}>
            <DataTable head={[t("Order", "주문번호"), t("Product", "상품"), t("Amount", "금액"), t("Status", "상태")]} empty={<EmptyState title={t("No orders", "주문이 없습니다")} />}>
              {orders.map(({ o, seller: store }) => (
                <tr key={o.id}>
                  <td className="whitespace-nowrap"><Link href={`/admin/orders/${o.id}`} className="font-semibold text-[#2f4ac2] hover:underline">{o.orderNo}</Link><div className="text-[11px] text-[#8a8d96]">{formatDate(o.createdAt, lang, true)}</div></td>
                  <td className="max-w-[260px]"><div className="truncate">{o.productTitle}</div><div className="text-[11px] text-[#8a8d96]">{store}</div></td>
                  <td className="whitespace-nowrap">{formatMoney(o.totalCents, o.currency, lang)}</td>
                  <td><div className="flex flex-wrap gap-1"><StatusBadge map={orderStatus} value={o.status} lang={lang} />{o.status === "paid" && o.fulfillmentStatus !== "not_required" && <StatusBadge map={fulfillmentStatus} value={o.fulfillmentStatus} lang={lang} />}{o.refundStatus !== "none" && o.refundStatus !== o.status && <StatusBadge map={refundStatus} value={o.refundStatus} lang={lang} />}{o.source === "admin_grant" && <Badge tone="violet">{t("Manual grant", "수동 지급")}</Badge>}</div></td>
                </tr>
              ))}
            </DataTable>
          </Panel>

          <Panel title={<>{t("Library (entitlements)", "보유 상품 (이용 권한)")} <span className="ml-1 text-[#8a8d96]">{entitlements.length}</span></>} bodyClass="p-0">
            <DataTable head={[t("Product", "상품"), t("Order", "주문"), t("Status", "상태"), t("Granted", "지급일"), ""]} empty={<EmptyState title={t("No entitlements", "보유 상품이 없습니다")} />}>
              {entitlements.map(({ e, title, orderNo, source }) => (
                <tr key={e.id}>
                  <td className="max-w-[260px]"><Link href={`/admin/products/${e.productId}`} className="block truncate hover:underline">{title}</Link></td>
                  <td className="whitespace-nowrap text-xs"><Link href={`/admin/orders/${e.orderId}`} className="text-[#2f4ac2] hover:underline">{orderNo}</Link>{source === "admin_grant" && <div><Badge tone="violet">{t("Manual grant", "수동 지급")}</Badge></div>}</td>
                  <td>{e.status === "active" ? <Badge tone="green">{t("Active", "이용 가능")}</Badge> : <Badge>{t("Revoked", "회수됨")}</Badge>}{e.revokedAt && <div className="text-[11px] text-[#8a8d96]">{formatDate(e.revokedAt, lang)}</div>}</td>
                  <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(e.createdAt, lang)}</td>
                  <td className="text-right">
                    {e.status === "active" && (
                      <details className="inline-block text-left">
                        <summary className="rc-btn rc-btn-outline rc-btn-sm cursor-pointer list-none">{t("Revoke", "권한 회수")}</summary>
                        <ActionForm action={revokeMemberEntitlement} className="mt-2 grid w-64 gap-2" confirm={t("Revoke access to this product? This does not refund the order.", "이 상품의 이용 권한을 회수할까요? 주문 환불은 되지 않습니다.")}>
                          <input type="hidden" name="entitlementId" value={e.id} />
                          <input name="reason" required maxLength={500} className="rc-input" placeholder={t("Reason (required)", "사유 (필수)")} />
                          <button className="rc-btn rc-btn-danger rc-btn-sm justify-self-end">{t("Revoke access", "회수")}</button>
                        </ActionForm>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
            <div className="border-t border-[#eef0f3] p-5">
              <h3 className="mb-1 text-sm font-semibold">{t("Grant access manually", "이용 권한 수동 지급")}</h3>
              <p className="mb-3 text-xs text-[#8a8d96]">{t("Creates a zero-amount paid order (source: admin_grant) with a manual payment record. Use for support compensation or replacements.", "0원 결제 완료 주문(유입: admin_grant)과 수동 결제 기록을 생성합니다. 보상·재지급 등 고객 지원 용도로 사용하세요.")}</p>
              <ActionForm action={grantMemberEntitlement} resetOnSuccess className="grid gap-2 md:grid-cols-[1fr_1fr_auto]" confirm={t("Grant access to the selected product?", "선택한 상품의 이용 권한을 지급할까요?")}>
                <input type="hidden" name="userId" value={user.id} />
                <select name="productId" required className="rc-select" defaultValue="">
                  <option value="" disabled>{t("Select product", "상품 선택")}</option>
                  {products.map((p) => <option key={p.id} value={p.id} disabled={activeEnt.has(p.id)}>{p.seller} · {p.title}{p.status !== "published" ? ` (${p.status})` : ""}{activeEnt.has(p.id) ? ` — ${t("owned", "보유")}` : ""}</option>)}
                </select>
                <input name="reason" required maxLength={500} className="rc-input" placeholder={t("Reason (required)", "지급 사유 (필수)")} />
                <button className="rc-btn rc-btn-primary">{t("Grant", "지급")}</button>
              </ActionForm>
            </div>
          </Panel>

          <Panel title={<>{t("Inquiries", "1:1 문의")} <span className="ml-1 text-[#8a8d96]">{inquiries.length}</span></>} bodyClass="p-0">
            <DataTable head={[t("Subject", "제목"), t("To", "문의 대상"), t("Status", "상태"), t("Updated", "최근 갱신")]} empty={<EmptyState title={t("No inquiries", "문의가 없습니다")} />}>
              {inquiries.map(({ i, store }) => (
                <tr key={i.id}>
                  <td className="max-w-[300px]"><Link href={`/admin/inquiries/${i.id}`} className="block truncate hover:underline">{i.subject}</Link><div className="text-[11px] text-[#8a8d96]">{i.category}</div></td>
                  <td className="text-xs">{store ?? t("Ringo support", "링고 고객센터")}</td>
                  <td><StatusBadge map={inquiryStatus} value={i.status} lang={lang} /></td>
                  <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(i.updatedAt, lang, true)}</td>
                </tr>
              ))}
            </DataTable>
          </Panel>

          <Panel title={<>{t("Active sessions", "활성 로그인 세션")} <span className="ml-1 text-[#8a8d96]">{sessions.length}</span></>} bodyClass="p-0">
            <DataTable head={[t("Signed in", "로그인"), t("Last seen", "최근 활동"), t("IP", "IP"), t("Device", "기기"), t("Expires", "만료")]} empty={<EmptyState title={t("No active sessions", "활성 세션이 없습니다")} />}>
              {sessions.map((x) => (
                <tr key={x.id}>
                  <td className="whitespace-nowrap text-xs">{formatDate(x.createdAt, lang, true)}{x.id === viewer.sessionId && <div><Badge tone="blue">{t("This session", "현재 세션")}</Badge></div>}</td>
                  <td className="whitespace-nowrap text-xs">{formatDate(x.lastSeenAt, lang, true)}</td>
                  <td className="font-mono text-xs">{x.ip ?? "—"}</td>
                  <td className="max-w-[320px] truncate text-xs text-[#6b6e78]" title={x.userAgent ?? ""}>{x.userAgent ?? "—"}</td>
                  <td className="whitespace-nowrap text-xs text-[#6b6e78]">{formatDate(x.expiresAt, lang)}</td>
                </tr>
              ))}
            </DataTable>
          </Panel>
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <Panel title={t("Profile", "회원 정보")}>
            <DetailList
              items={[
                [t("Name", "이름"), user.name],
                [t("Email", "이메일"), <a key="e" href={`mailto:${user.email}`} className="text-[#2f4ac2] hover:underline">{user.email}</a>],
                [t("Phone", "연락처"), user.phone ?? "—"],
                [t("Role", "회원구분"), <StatusBadge key="r" map={roleLabel} value={user.role} lang={lang} />],
                [t("Email verified", "이메일 인증"), user.emailVerifiedAt ? formatDate(user.emailVerifiedAt, lang, true) : <Badge key="v">{t("Not verified", "미인증")}</Badge>],
                [t("Marketing", "마케팅 수신"), user.marketingOptIn ? t("Opted in", "동의") : t("Opted out", "거부")],
                [t("Language", "언어"), user.locale],
                [t("Last login", "최근 로그인"), formatDate(user.lastLoginAt, lang, true)],
                [t("Joined", "가입일"), formatDate(user.createdAt, lang, true)],
              ]}
            />
          </Panel>

          {seller && (
            <Panel title={t("Seller profile", "판매자 정보")} actions={<Link href={seller.status === "pending" ? "/admin/sellers/applications" : `/admin/sellers/${seller.id}`} className="rc-btn rc-btn-outline rc-btn-sm">{t("Open", "보기")}</Link>}>
              <DetailList items={[[t("Store", "스토어"), seller.displayName], [t("Address", "주소"), `/s/${seller.slug}`], [t("Status", "상태"), <StatusBadge key="s" map={sellerStatus} value={seller.status} lang={lang} />]]} />
            </Panel>
          )}

          <Panel title={t("Account status", "계정 상태")}>
            {self ? (
              <Notice>{t("You cannot suspend your own account.", "본인 계정은 정지할 수 없습니다.")}</Notice>
            ) : user.status === "active" ? (
              <ActionForm action={setMemberStatus} className="grid gap-2" confirm={t("Suspend this member? They are signed out immediately and cannot sign in.", "이 회원을 정지할까요? 즉시 로그아웃되며 로그인할 수 없습니다.")}>
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="status" value="suspended" />
                <label className="grid gap-1.5 text-sm"><span className="font-medium">{t("Reason", "정지 사유")}<span className="text-[#e5484d]">*</span></span><textarea name="reason" required maxLength={500} className="rc-textarea !min-h-[64px]" placeholder={t("Recorded in the admin memo", "관리자 메모에 기록됩니다")} /></label>
                <button className="rc-btn rc-btn-danger justify-self-start">{t("Suspend member", "회원 정지")}</button>
              </ActionForm>
            ) : (
              <ActionForm action={setMemberStatus} className="grid gap-2" confirm={t("Reactivate this member?", "이 회원의 이용을 재개할까요?")}>
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="status" value="active" />
                <input name="reason" maxLength={500} className="rc-input" placeholder={t("Note (optional)", "메모 (선택)")} />
                <button className="rc-btn rc-btn-primary justify-self-start">{t("Reactivate", "이용 재개")}</button>
              </ActionForm>
            )}
          </Panel>

          <Panel title={t("Admin memo", "관리자 메모")} description={t("Internal only.", "내부용 메모입니다.")}>
            <ActionForm action={saveMemberMemo} className="grid gap-2">
              <input type="hidden" name="userId" value={user.id} />
              <textarea key={user.adminMemo ?? ""} name="memo" maxLength={4000} defaultValue={user.adminMemo ?? ""} className="rc-textarea !min-h-[120px]" />
              <button className="rc-btn rc-btn-outline rc-btn-sm justify-self-end">{t("Save memo", "메모 저장")}</button>
            </ActionForm>
          </Panel>
        </div>
      </div>
    </>
  );
}
