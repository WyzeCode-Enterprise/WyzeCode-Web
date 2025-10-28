import { NextRequest, NextResponse } from "next/server";

// hosts permitidos pra validar redirect absoluto
const ALLOWED_REDIRECT_HOSTS = [
  "wyzebank.com",
  "www.wyzebank.com",
  "localhost",
  "localhost:3000",
];

// helper: essa URL quer fluxo Discord?
function isDiscordRedirectParam(raw: string | null): boolean {
  if (!raw) return false;

  // caso 1: veio já como path interno
  // ex: /link/discord
  if (raw === "/link/discord") {
    return true;
  }

  // caso 2: veio como URL absoluta tipo:
  // http://localhost:3000/link/discord  (ou https://wyzebank.com/link/discord)
  try {
    const u = new URL(raw);

    if (!ALLOWED_REDIRECT_HOSTS.includes(u.host)) {
      return false;
    }

    if (u.pathname === "/link/discord") {
      return true;
    }
  } catch {
    // se não é URL válida, ignora
  }

  return false;
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const session = req.cookies.get("wzb_lg")?.value;

  // ======================================================
  // (A) PROTEGER /app/**
  // mesma lógica que você já tinha
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
  // (B) SETAR wzb_postlogin_redirect QUANDO ACESSA /login
  //
  // Se o cara abriu /login?redirect=<alguma coisa que aponta pra /link/discord>,
  // nós criamos o cookie "wzb_postlogin_redirect" = "/link/discord".
  //
  // Esse cookie é lido depois no /dash pra fazer o redirect automático.
  // ======================================================
  if (req.nextUrl.pathname === "/login") {
    const redirectParam = req.nextUrl.searchParams.get("redirect");
    const wantsDiscord = isDiscordRedirectParam(redirectParam);

    if (wantsDiscord) {
      const res = NextResponse.next();

      res.cookies.set({
        name: "wzb_postlogin_redirect",
        value: "/link/discord",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 300, // ~5min: tempo suficiente pro login -> /dash -> /link/discord
      });

      return res;
    }
  }

  // ======================================================
  // (C) APAGAR wzb_postlogin_redirect QUANDO O USER JÁ CHEGOU
  //
  // Cenário:
  //  1. user faz login com redirect especial
  //  2. /dash vê o cookie e manda ele pra /link/discord
  //  3. quando ele já ESTÁ em /link/discord (ou no callback),
  //     esse cookie não tem mais utilidade e pode quebrar login futuro.
  //
  // Então aqui limpamos ele.
  //
  // IMPORTANTE: isso acontece no request de /link/discord*,
  // então só depois do redirecionamento ter acontecido.
  // ======================================================
  if (
    req.nextUrl.pathname === "/link/discord" ||
    req.nextUrl.pathname.startsWith("/link/discord/")
  ) {
    // vamos sempre mandar resposta next(), mas sobrescrevendo o cookie
    const res = NextResponse.next();

    // deletar o cookie = setar Max-Age=0
    res.cookies.set({
      name: "wzb_postlogin_redirect",
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0, // mata agora
    });

    return res;
  }

  // ======================================================
  // (D) fluxo default
  // ======================================================
  return NextResponse.next();
}

// ======================================================
// matcher
//
// precisamos interceptar:
// - /app/**          (proteção + não logado redirect login)
// - /login           (pra setar o cookie postlogin)
// - /link/discord**  (pra apagar o cookie quando chegou lá)
// ======================================================
export const config = {
  matcher: ["/app/:path*", "/login", "/link/discord/:path*"],
};
