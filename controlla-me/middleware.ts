import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "";

  // lexmea.studio → serve /console
  if (hostname.includes("lexmea.studio")) {
    const { pathname } = request.nextUrl;

    // Passthrough for API, static, and console assets
    if (
      pathname.startsWith("/api/console") ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/favicon")
    ) {
      return NextResponse.next();
    }

    // Everything else → rewrite to /console
    const url = request.nextUrl.clone();
    url.pathname = "/console";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
