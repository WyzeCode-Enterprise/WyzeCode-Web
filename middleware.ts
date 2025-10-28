import { NextRequest, NextResponse } from "next/server";

// hosts permitidos pra validar redirect absoluto
const ALLOWED_REDIRECT_HOSTS = [
  "wyzebank.com",
  "www.wyzebank.com",
  "localhost",
  "localhost:3000",
];

/* -------------------------------------------------
   normaliza o valor cru do redirect:
   - decodifica %2F etc
   - retorna string utilizável
------------------------------------------------- */
function normalizeRedirectParam(raw: string | null): string | null {
  if (!raw) return null;

  let decoded = raw.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // se der erro no decodeURIComponent, usa o raw mesmo
  }

  return decoded;
}

/* -------------------------------------------------
   essa URL/rota pede fluxo Discord (/link/discord)?
   aceita:
     - "/link/discord"
     - "https://wyzebank.com/link/discord"
     - "http://localhost:3000/link/discord"
------------------------------------------------- */
function isDiscordRedirectParam(raw: string | null): boolean {
  if (!raw) return false;
  const candidate = normalizeRedirectParam(raw);
  if (!candidate) return false;

  // caso 1: já é path interno
  if (candidate === "/link/discord") return true;

  // caso 2: URL absoluta válida e host permitido e pathname correto
  try {
    const u = new URL(candidate);

    if (!ALLOWED_REDIRECT_HOSTS.includes(u.host)) {
      return false;
    }

    if (u.pathname === "/link/discord") {
      return true;
    }
  } catch {
    // não é URL válida -> ignora
  }

  return false;
}

/* -------------------------------------------------
   pega o redirect da query MESMO SE vier zoado tipo "? redirect=..."
   (com espaço antes do nome do param)
------------------------------------------------- */
function getRedirectParamLoose(req: NextRequest): string | null {
  // tenta padrão
  let value = req.nextUrl.searchParams.get("redirect");
  if (value) return value;

  // fallback: vasculha todos os params
  for (const [key, val] of req.nextUrl.searchParams.entries()) {
    if (key.trim().toLowerCase() === "redirect") {
      return val;
    }
  }

  return null;
}

// gera token randômico [a-zA-Z0-9] de N chars usando Web Crypto (Edge-safe)
function generateToken(length: number) {
  const alphabet =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export function middleware(req: NextRequest) {
  const session = req.cookies.get("wzb_lg")?.value;
  const pathname = req.nextUrl.pathname;

  // ======================================================
  // (A) PROTEGER /app/**
  // se tentar acessar /app/** sem "wzb_lg", manda pro /login
  // ======================================================
  if (
    pathname.startsWith("/app") &&
    !pathname.startsWith("/app/login") &&
    !pathname.startsWith("/app/logout")
  ) {
    if (!session) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      return NextResponse.redirect(loginUrl);
    }
  }

  // ======================================================
  // (B) /login -> lidar com redirect + wzb_tk
  // ======================================================
  if (pathname === "/login") {
    const rawRedirectParam = getRedirectParamLoose(req);
    const wantsDiscord = isDiscordRedirectParam(rawRedirectParam);

    if (wantsDiscord) {
      // se já tem wzb_tk= dentro do redirect, NÃO gera outro token
      // (isso evita redirect infinito)
      const alreadyHasToken =
        typeof rawRedirectParam === "string" &&
        rawRedirectParam.includes("wzb_tk=");

      if (alreadyHasToken) {
        const res = NextResponse.next();

        // mantém seu cookie post-login
        res.cookies.set({
          name: "wzb_postlogin_redirect",
          value: "/link/discord",
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 300, // 5 minutos: login -> /dash -> /link/discord
        });

        return res;
      }

      // ainda não tem token -> gerar UMA vez só no servidor
      const token = generateToken(50);

      // monta nova URL:
      // /login?redirect=OQUE-JA-GERA?wzb_tk=TOKEN50
      const newUrl = req.nextUrl.clone();
      newUrl.searchParams.set(
        "redirect",
        `${rawRedirectParam}?wzb_tk=${token}`
      );

      const res = NextResponse.redirect(newUrl);

      // seta cookie padrão
      res.cookies.set({
        name: "wzb_postlogin_redirect",
        value: "/link/discord",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 300,
      });

      return res;
    }

    // se NÃO é fluxo discord, segue normal
    return NextResponse.next();
  }

  // ======================================================
  // (C) /link/discord -> limpar cookie pós login
  // ======================================================
  if (pathname.startsWith("/link/discord")) {
    const res = NextResponse.next();
    res.cookies.delete("wzb_postlogin_redirect");
    return res;
  }

  // default
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/login", "/link/discord/:path*"],
};
