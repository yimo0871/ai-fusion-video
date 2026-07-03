import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/register", "/setup", "/forgot-password"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("auth-token")?.value;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  const isRoot = pathname === "/";

  if (isRoot) {
    try {
      const response = await fetch("http://localhost:18080/api/system/init/status", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.code === 0 && data.data) {
          if (!data.data.initialized) {
            return NextResponse.redirect(new URL("/setup", request.url));
          }
        }
      }
    } catch {
    }
  }

  if (token && isRoot) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (token && isPublicPath) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!token && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
