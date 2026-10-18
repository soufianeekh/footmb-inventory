import { edgeAuth } from "@/auth-edge";
import { NextResponse } from "next/server";
import { hasPermission, type Permission } from "@/lib/permissions";

export const proxy = edgeAuth((request) => {
  const path = request.nextUrl.pathname;
  // Auth.js routes handle their own CSRF and credential checks.
  if (
    path === "/login" ||
    path === "/accept-invite" ||
    path.startsWith("/api/auth/") ||
    path === "/api/invitations/accept" ||
    path === "/api/webhooks/shopify" ||
    path === "/api/internal/inventory/process"
  ) return NextResponse.next();
  const authorized = Boolean(request.auth?.user?.email);
  if (authorized) {
    const pagePermissions: Array<[string, Permission]> = [
      ["/users", "staff.manage"], ["/settings", "settings.manage"],
      ["/activity", "staff.activity.read"],
      ["/stats", "statistics.read"], ["/pos", "pos.read"],
    ];
    const required = pagePermissions.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1];
    if (required && !hasPermission(request.auth!.user.role, required)) {
      if (path.startsWith("/api/")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      return NextResponse.redirect(new URL("/", request.nextUrl));
    }
    return NextResponse.next();
  }
  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401,
      headers: { "Cache-Control": "no-store" } });
  }
  const url = new URL("/login", request.nextUrl);
  // Do not reflect untrusted external return destinations.
  if (path !== "/") url.searchParams.set("callbackUrl", path);
  return NextResponse.redirect(url);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|manifest.webmanifest).*)"],
};
