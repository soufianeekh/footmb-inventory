import { auth } from "@/auth";
import { NextResponse } from "next/server";

export const proxy = auth((request) => {
  const path = request.nextUrl.pathname;
  // Auth.js routes handle their own CSRF and credential checks.
  if (
    path === "/login" ||
    path.startsWith("/api/auth/") ||
    path === "/api/webhooks/shopify" ||
    path === "/api/internal/inventory/process"
  ) return NextResponse.next();
  const authorized = Boolean(request.auth?.user?.email);
  if (authorized) return NextResponse.next();
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
