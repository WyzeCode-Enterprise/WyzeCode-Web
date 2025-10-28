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
    // se não dá decodeURIComponent sem erro, usa o raw mesmo
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
    // não é URL válida, ignora
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

export function middleware(req: NextRequest) {
  const session = req.cookies.get("wzb_lg")?.value;
  const pathname = req.nextUrl.pathname;

  // ======================================================
  // (A) PROTEGER /app/**
  // igual sua lógica original:
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
      // mantém query? você não mantinha antes, então vou manter igual
      return NextResponse.redirect(loginUrl);
    }
  }

  // ======================================================
  // (B) /login COM redirect -> /link/discord
  //
  // SEMPRE que acessar /login com um redirect apontando
  // pra /link/discord, a gente (re)cria o cookie
  //   wzb_postlogin_redirect = "/link/discord"
  //
  // Isso garante que mesmo depois do cara desvincular,
  // se ele voltar em /login?redirect=.../link/discord
  // o cookie volta a existir.
  //
  // IMPORTANTE: a gente NÃO apaga o cookie aqui se não houver redirect.
  // A gente simplesmente não mexe nele nesses casos.
  // ======================================================
  if (pathname === "/login") {
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
        maxAge: 300, // 5 minutos: login -> /dash -> /link/discord
      });

      return res;
    }

    // se NÃO é fluxo discord, não tocamos no cookie.
    return NextResponse.next();
  }

  // ======================================================
  // (C) /link/discord (ou subrotas tipo /link/discord/callback)
  //
  // Quando o usuário chega aqui, significa que:
  //   - ele já fez login
  //   - /dash já redirecionou ele pro /link/discord usando o cookie
  //
  // Agora o cookie "wzb_postlogin_redirect" já cumpriu a função
  // e precisa sumir pra não poluir o próximo login normal.
  //
  // Então SEMPRE apagamos ele aqui.
  // ======================================================
  if (
    pathname === "/link/discord" ||
    pathname.startsWith("/link/discord/")
  ) {
    const res = NextResponse.next();

    res.cookies.set({
      name: "wzb_postlogin_redirect",
      value: "",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0, // mata o cookie
    });

    return res;
  }

  // ======================================================
  // (D) default
  // não mexe no cookie em nenhuma outra rota
  // ======================================================
  return NextResponse.next();
}

// ======================================================
// matcher
//
// rodamos em:
// - /app/**           pra proteger área logada
// - /login            pra setar (ou não) o cookie especial
// - /link/discord/**  pra limpar o cookie
//
// isso faz o cookie nascer SEMPRE que for pedido fluxo discord,
// e morrer SEMPRE que ele já chegou no /link/discord.
// Em qualquer outro fluxo ele fica quieto.
// ======================================================
export const config = {
  matcher: ["/app/:path*", "/login", "/link/discord/:path*"],
};
