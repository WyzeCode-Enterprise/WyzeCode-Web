import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const session = req.cookies.get("wzb_lg")?.value;

  if (req.nextUrl.pathname.startsWith("/app") && !req.nextUrl.pathname.startsWith("/app/login") && !req.nextUrl.pathname.startsWith("/app/logout")) {
    if (!session) {
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
