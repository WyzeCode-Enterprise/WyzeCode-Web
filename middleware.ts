import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const session = req.cookies.get("wzb_lg")?.value;

  // Só protege páginas dentro de /app, exceto /login e /logout
  if (req.nextUrl.pathname.startsWith("/app") && !req.nextUrl.pathname.startsWith("/app/login") && !req.nextUrl.pathname.startsWith("/app/logout")) {
    if (!session) {
      // Redireciona para login com URL absoluta
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

// Configura onde o middleware deve ser aplicado
export const config = {
  matcher: ["/app/:path*"],
};
