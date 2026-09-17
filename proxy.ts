import { NextResponse, type NextRequest } from "next/server";

/**
 * Signed-out visitors who open a console or account URL directly are sent to the login page with the page they
 * wanted as `next`, so they land back there after signing in (layouts cannot see the pathname, so this runs first).
 *
 * Only full document loads are redirected: Next.js strips its Flight headers here, so an RSC request (a link
 * prefetch from a public page, for example) is indistinguishable from a navigation and redirecting it would make
 * the router navigate on its own. Those requests fall through to the page's own `requireViewer` / `requireSeller`
 * / `requireAdmin` check, which is what actually enforces access.
 */
export function proxy(request: NextRequest) {
  if (request.headers.get("sec-fetch-dest") !== "document") return NextResponse.next();
  if (request.cookies.has("__Host-ringo_session") || request.cookies.has("ringo_session")) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  const login = new URL("/login", request.nextUrl);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/account/:path*", "/seller/:path*", "/admin/:path*"],
};
