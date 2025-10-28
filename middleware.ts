import { NextRequest, NextResponse } from "next/server";

// hosts que você aceita pra URL absoluta do redirect
const ALLOWED_REDIRECT_HOSTS = [
  "wyzebank.com",
  "www.wyzebank.com",
  "localhost",
  "localhost:3000",
];

// descobre se ?redirect= ... representa "quero ir pro /link/discord"
function isDiscordRedirectParam(raw: string | null): boolean {
  if (!raw) return false;

  // Caso simples: já veio como path interno
  // /link/discord
  if (raw === "/link/discord") {
    return true;
  }

  // Caso comum no teu fluxo:
  // redirect=http%3A%2F%2Flocalhost%3A3000%2Flink%2Fdiscord
  // req.nextUrl.searchParams.get("redirect") já vem DECODIFICADO,
  // então aqui `raw` já deve ser "http://localhost:3000/link/discord"
  try {
    const u = new URL(raw);

    // só consideramos se host é permitido (evita open redirect)
    if (!ALLOWED_REDIRECT_HOSTS.includes(u.host)) {
      return false;
    }

    // precisa ser exatamente /link/discord
    if (u.pathname === "/link/discord") {
      return true;
    }
  } catch {
    // se new URL() falhar, ignora
  }

  return false;
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const session = req.cookies.get("wzb_lg")?.value;

  // ======================================================
  // 1) Proteção da área /app/**
  //    (isso é sua lógica original, mantida)
  // ======================================================
  if (
    req.nextUrl.pathname.startsWith("/app") &&
    !req.nextUrl.pathname.startsWith("/app/login") &&
    !req.nextUrl.pathname.startsWith("/app/logout")
  ) {
    if (!session) {
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }

  // ======================================================
  // 2) Fluxo especial /login?redirect=.../link/discord
  //
  // Se o user abre /login com esse redirect apontando pra /link/discord,
  // já injeta o cookie wzb_postlogin_redirect = "/link/discord"
  // pra ser usado depois no /dash.
  // ======================================================
  if (req.nextUrl.pathname === "/login") {
    const redirectParam = req.nextUrl.searchParams.get("redirect");
    const wantsDiscord = isDiscordRedirectParam(redirectParam);

    if (wantsDiscord) {
      const res = NextResponse.next();

      // cookie "hint" pro pós-login:
      // fixo: "/link/discord"
      res.cookies.set({
        name: "wzb_postlogin_redirect",
        value: "/link/discord",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 300, // 5min, tempo suficiente pro login -> /dash -> /link/discord
      });

      return res;
    }
  }

  // nada especial, segue fluxo normal
  return NextResponse.next();
}

// ======================================================
// 3) matcher
//
// Agora o middleware precisa rodar em:
//  - /app/**      (proteção área logada)
//  - /login       (pra poder setar o cookie especial)
// ======================================================
export const config = {
  matcher: ["/app/:path*", "/login"],
};
