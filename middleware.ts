import { NextRequest, NextResponse } from "next/server";

// hosts permitidos pra validar redirect absoluto
const ALLOWED_REDIRECT_HOSTS = [
  "wyzebank.com",
  "www.wyzebank.com",
  "localhost",
  "localhost:3000",
];

// helper: tenta normalizar o valor cru do redirect
function normalizeRedirectParam(raw: string | null): string | null {
  if (!raw) return null;

  // tenta decodificar caso tenha vindo urlencoded
  // tipo "https%3A%2F%2Fwyzebank.com%2Flink%2Fdiscord"
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // se der erro no decodeURIComponent ignora e segue com o original
  }

  return decoded;
}

// helper: essa URL representa fluxo do Discord (/link/discord)?
function isDiscordRedirectParam(raw: string | null): boolean {
  if (!raw) return false;

  const candidate = normalizeRedirectParam(raw);
  if (!candidate) return false;

  // Caso 1: veio como path interno puro
  // ex: "/link/discord"
  if (candidate === "/link/discord") {
    return true;
  }

  // Caso 2: veio como URL absoluta
  // ex: "https://wyzebank.com/link/discord"
  // ou   "http://localhost:3000/link/discord"
  try {
    const u = new URL(candidate);

    if (!ALLOWED_REDIRECT_HOSTS.includes(u.host)) {
      return false;
    }

    if (u.pathname === "/link/discord") {
      return true;
    }
  } catch {
    // não era URL absoluta válida, ignora
  }

  return false;
}

// helper: pega o valor do redirect mesmo se vier zoado tipo "? redirect=..."
function getRedirectParamLoose(req: NextRequest): string | null {
  // tenta o normal primeiro
  let value = req.nextUrl.searchParams.get("redirect");
  if (value) return value;

  // fallback: procurar qualquer chave que, após trim, vire "redirect"
  // isso cobre "? redirect=..." (com espaço antes)
  for (const [key, val] of req.nextUrl.searchParams.entries()) {
    if (key.trim().toLowerCase() === "redirect") {
      return val;
    }
  }

  return null;
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const session = req.cookies.get("wzb_lg")?.value;

  // ======================================================
  // (A) proteger /app/**
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
  // Se o cara abriu /login com redirect apontando pra /link/discord
  // (mesmo que tenha espaço no "? redirect="), criamos o cookie
  // wzb_postlogin_redirect = "/link/discord".
  //
  // Esse cookie é lido depois no /dash pra redirecionar automaticamente.
  // ======================================================
  if (req.nextUrl.pathname === "/login") {
    const rawRedirectParam = getRedirectParamLoose(req);
    const wantsDiscord = isDiscordRedirectParam(rawRedirectParam);

    if (wantsDiscord) {
      const res = NextResponse.next();

      res.cookies.set({
        name: "wzb_postlogin_redirect",
        value: "/link/discord",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 300, // ~5min: tempo suficiente login -> /dash -> /link/discord
      });

      return res;
    }
  }

  // ======================================================
  // (C) APAGAR wzb_postlogin_redirect QUANDO O USER JÁ CHEGOU
  //
  // Fluxo:
  //  1. user entrou no /login com redirect pro discord -> cookie criado
  //  2. fez login -> /dash leu o cookie e redirecionou pro /link/discord
  //  3. agora que ele JÁ está em /link/discord (/link/discord ou /link/discord/callback),
  //     limpamos o cookie pra não interferir em próximos logins normais
  // ======================================================
  if (
    req.nextUrl.pathname === "/link/discord" ||
    req.nextUrl.pathname.startsWith("/link/discord/")
  ) {
    const res = NextResponse.next();

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
// precisa rodar em:
// - /app/**          (proteção área logada)
// - /login           (pra criar o cookie pós-login se for fluxo discord)
// - /link/discord**  (pra deletar o cookie depois que já chegou)
// ======================================================
export const config = {
  matcher: ["/app/:path*", "/login", "/link/discord/:path*"],
};
