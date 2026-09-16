# Ringo architecture & code conventions

## Runtime
- Next.js 16 App Router (Node.js runtime), React 19, TypeScript, Tailwind 4, shadcn/ui (Radix).
- `pnpm dev` → http://localhost:3031. `pnpm build && pnpm start` for production (`output: "standalone"`).
- Next 16 specifics: `params`, `searchParams`, `cookies()`, `headers()` are **async** (await them).

## Data
- PostgreSQL via Drizzle ORM. Schema: `db/schema.ts`. Migrations: `drizzle/` (`pnpm db:generate`).
- No `DATABASE_URL` → embedded **PGlite** at `.data/pglite` (zero-install local dev). With `DATABASE_URL` → postgres.js (AWS RDS/Aurora).
- `getDb()` (`lib/server/db.ts`) migrates + bootstraps on first use. Demo data is auto-seeded in development on an empty DB.
- Money = integer cents (`*_cents`), currency column. Timestamps = timestamptz.

## Demo accounts (development only, password `ringo1234!`)
| Role | Email |
|---|---|
| Super admin | admin@ringo.local |
| Seller (Studio North) | studio@ringo.local |
| Seller (Form & Field) | formfield@ringo.local |
| Buyer | buyer@ringo.local |
| Pending seller applicant | applicant@ringo.local |

## Auth & permissions (`lib/server/auth.ts`)
- Email + password (scrypt), DB sessions (`sessions` table, sha256 token hash), httpOnly cookie.
- `getViewer()` → `{ user, seller, sessionId } | null` (memoized per request).
- `requireAdmin()`, `requireSeller()` (active seller only), `requireViewer(next)`.
- Roles: `buyer` → applies at `/sell` → admin approves → `seller` role + active `sellers` row. `admin` = super admin.
- Every permission check happens on the server (pages, server actions, route handlers). Never trust client-provided owner ids.

## Server-side modules (`lib/server/*`)
| Module | Purpose |
|---|---|
| `commerce.ts` | orders, coupons, payments confirm/fail, fulfillment, refunds, settlements (`CommerceError(code)`) |
| `catalog.ts` | product create/update (`saveProduct`), submit for review, admin review, status changes, asset delete |
| `links.ts` | deep links (`saveLink`, `toggleLink`, `linkStats`), attribution cookie |
| `payments/` | provider adapters: `test` sandbox, `pearpay` / `nextpay` skeletons (need PG API spec) |
| `storage.ts` | local disk (`.data/uploads`) or S3 (`S3_BUCKET`); `mediaUrl(key)` for covers/banners |
| `mail.ts` | SMTP (e.g. SES) or outbox log (`mail_outbox`) |
| `audit.ts` | `audit(db, viewer, action, targetType, targetId, data)`, `logError` |
| `settings.ts` | site settings stored in `settings` table (`getSettings`) |
| `analytics.ts` | `dailySales`, `salesSummary` |
| `list.ts` | `listParams(sp)`, `periodWhere(col, sp)`, `likeQ`, `csvResponse` |
| `action.ts` | `run(async () => {...})` wraps server actions → `ActionResult` with localized errors |
| `i18n-server.ts` | `getT(fallbackLang)` → `{ t, lang }` (cookie `ringo-lang`) |
| `storefront.ts` | buyer-facing queries: `purchasableWhere()` (published + visible + active seller), `listCatalog`, `productBySlug`, `activeBanners`, `highlightedSellers`, `wishlistIds`, `activeEntitlement`, `recomputeRating` |
| `checkout.ts` | `paymentOptions(enabledProviders, t)` for checkout (ready providers first, enabled-but-not-ready shown disabled) |

## Storefront & buyer account (`app/(site)`)
- `/` home (banners, categories, featured, URL-driven catalog `q`/`category`/`sort`/`page`), `/p/[slug]`, `/s/[slug]`, `/notices`, `/terms`, `/privacy`.
- Checkout: `/checkout?product=<slug>&coupon=` → `placeOrder` (`createOrder` + `startPayment`) → provider URL. `/checkout/[orderId]` resumes/cancels a pending order. Test sandbox: `/pay/test/[paymentId]`.
- Account `/account/*`: overview, library (+ course view with `lesson_progress`), orders (receipt, refund request, review), wishlist, inquiries, profile & sessions. Actions in `app/(site)/account/actions.ts` always scope by `viewer.user.id`.
- Styles: `app/storefront.css` (`sf-*`) on top of `globals.css` / `ringo-home.css` (`rh-*`). `globals.css` resets `h1,h2,h3,p{margin:0}` outside Tailwind layers, so margins on those elements need `!m*` utilities.
- UI: `components/store/*` (`ProductCard`, `WishlistButton`, `HeroCarousel`, `RedirectForm`, account `Card`/`Empty`/`Pager`). Scripts: `tests/tools/store-shot.mjs`, `store-purchase.mjs`, `store-post.mjs`.

## Route handlers
- `POST /api/uploads` (multipart: `file`, `kind` = cover | banner | avatar | product-asset | deliverable, `productId`/`orderId`)
- `GET /api/download/asset/:id` (entitlement check), `GET /api/download/deliverable/:id`
- `GET /media/public/...` public images, `GET /l/:code` deep link redirect, `POST /api/payments/webhook/:provider`, `GET /api/health`

## UI conventions
- i18n: every visible string via `t(en, ko)`. Server: `const { t, lang } = await getT("ko")` in consoles, `getT()` (en default) in storefront. Client: `useLang()`.
- Status labels/tones: `lib/status.ts` + `<StatusBadge map={orderStatus} value=... lang=... />`.
- Console building blocks (`components/console`): `ConsoleShell`, `PageHeader`, `Panel`, `StatCard`, `DataTable`, `EmptyState`, `DetailList`, `Field`, `Notice`, `Badge`, `FilterBar`, `Pagination`, `SalesChart`.
- Forms: server action + `<ActionForm action={fn}>` (toast + refresh) or `<ActionButton action={fn}>`. Inputs use `rc-input`, `rc-select`, `rc-textarea`; buttons `rc-btn rc-btn-primary|outline|brand|danger [rc-btn-sm]`.
- Uploads: `<ImageUploadField>` and `<FileUploadButton>` from `components/common/uploader.tsx`.
- Server action pattern:
  ```ts
  "use server";
  export async function approve(id: string): Promise<ActionResult> {
    return run(async () => {
      const viewer = await requireAdmin();
      const db = await getDb();
      ...
      await audit(db, viewer, "product.approve", "product", id);
      return { ok: true, message: t("Approved", "승인했습니다") };
    });
  }
  ```
- Lists: server page reads `searchParams`, filters in SQL, paginates with `listParams`, renders `FilterBar` + `DataTable` + `Pagination`.
