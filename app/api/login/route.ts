import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

const NEXT_COOKIE_NAME = "wzb_next";
const POSTLOGIN_REDIRECT_COOKIE = "wzb_postlogin_redirect";

// hosts permitidos pra redirect absoluto
const ALLOWED_REDIRECT_HOSTS = [
  "wyzebank.com",
  "www.wyzebank.com",
  "localhost",
  "localhost:3000",
];

// analisa user-agent (navegador/sistema)
function parseUserAgent(ua: string) {
  const u = ua.toLowerCase();
  let browser = "Desconhecido";
  let os = "Desconhecido";

  if (u.includes("chrome") && !u.includes("edg") && !u.includes("opr"))
    browser = "Google Chrome";
  else if (u.includes("edg"))
    browser = "Microsoft Edge";
  else if (u.includes("firefox"))
    browser = "Mozilla Firefox";
  else if (u.includes("safari") && !u.includes("chrome"))
    browser = "Safari";
  else if (u.includes("opr") || u.includes("opera"))
    browser = "Opera";

  if (u.includes("windows nt 10")) os = "Windows 10";
  else if (u.includes("windows nt 6.3")) os = "Windows 8.1";
  else if (u.includes("mac os x")) os = "macOS";
  else if (u.includes("android")) os = "Android";
  else if (u.includes("iphone") || u.includes("ipad")) os = "iOS";
  else if (u.includes("linux")) os = "Linux";

  return { browser, os };
}

/**
 * Decide pra onde redirecionar depois do login.
 *
 * Prioridade:
 *   1. query ?redirect=URLABSOLUTA ou PATH
 *   2. query ?next=/alguma-coisa
 *   3. body.next
 *   4. cookie wzb_next
 *
 * Segurança:
 * - Se começa com "/", aceita
 * - Se for URL absoluta, só aceita se host permitido
 * - Senão cai pra /dash
 */
function pickFinalRedirect({
  queryRedirect,
  queryNext,
  bodyNext,
  cookieNext,
}: {
  queryRedirect: string | null;
  queryNext: string | null;
  bodyNext: string | null;
  cookieNext: string | null;
}): string {
  function sanitize(candidateRaw: string | null): string | null {
    if (!candidateRaw) return null;

    // path interno tipo "/link/discord"
    if (candidateRaw.startsWith("/")) {
      return candidateRaw;
    }

    // url absoluta
    try {
      const u = new URL(candidateRaw);
      if (ALLOWED_REDIRECT_HOSTS.includes(u.host)) {
        return u.toString();
      }
    } catch {
      // não é URL válida / host proibido
    }

    return null;
  }

  const ordered = [queryRedirect, queryNext, bodyNext, cookieNext];

  for (const cand of ordered) {
    const ok = sanitize(cand || null);
    if (ok) return ok;
  }

  return "/dash";
}

/**
 * Detecta se ESSA requisição do /login está vindo daquele fluxo especial
 *   /login?redirect=http://localhost:3000/link/discord
 * ou equivalente em prod.
 *
 * Regra:
 * - Se queryRedirect for "/link/discord" direto -> true
 * - Se queryRedirect for URL absoluta permitida, e pathname === "/link/discord" -> true
 * - Senão -> false
 *
 * Isso cobre exatamente seu caso:
 *   redirect=http%3A%2F%2Flocalhost%3A3000%2Flink%2Fdiscord
 */
function isDiscordFlowRequested(queryRedirect: string | null): boolean {
  if (!queryRedirect) return false;

  // caso simples: já veio como path interno
  if (queryRedirect === "/link/discord") return true;

  // caso URL absoluta: http://localhost:3000/link/discord
  try {
    const u = new URL(queryRedirect);

    // só consideramos hosts permitidos
    if (!ALLOWED_REDIRECT_HOSTS.includes(u.host)) {
      return false;
    }

    // queremos exatamente essa rota
    if (u.pathname === "/link/discord") {
      return true;
    }
  } catch {
    // se não conseguiu dar new URL, ignora
  }

  return false;
}

/**
 * Helper pra anexar (ou limpar) o cookie wzb_postlogin_redirect
 * em QUALQUER resposta.
 *
 * Regra nova que você pediu:
 * - Se URL da requisição atual contém redirect apontando pra /link/discord,
 *   então SEMPRE setar wzb_postlogin_redirect = "/link/discord"
 *   (httpOnly, etc), mesmo se o login ainda não finalizou.
 *
 * - Caso contrário, não mexe nesse cookie.
 *
 * Observação:
 * Você disse "em tempo real vai adicionar ... só isso".
 * Então aqui a gente SÓ faz set quando for true,
 * não limpa se for false.
 *
 * Se quiser limpar quando não for discordFlowNow, dá pra mudar.
 */
function attachDiscordCookie(
  res: NextResponse,
  discordFlowNow: boolean
) {
  if (!discordFlowNow) {
    return res;
  }

  const isProd = process.env.NODE_ENV === "production";

  res.cookies.set(POSTLOGIN_REDIRECT_COOKIE, "/link/discord", {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 300, // 5min é o bastante até o /dash ler e redirecionar
  });

  return res;
}

export async function POST(req: NextRequest) {
  try {
    // body enviado pelo front
    const { email, password, next: nextFromBody } = await req.json();

    if (!email) {
      // mesmo erro volta com cookie se necessário
      const badRes = NextResponse.json(
        { error: "Email é obrigatório" },
        { status: 400 }
      );

      // checa URL pra ver se é fluxo discord
      const urlTmp = new URL(req.url);
      const queryRedirectTmp = urlTmp.searchParams.get("redirect");
      const discordFlowTmp = isDiscordFlowRequested(queryRedirectTmp);
      attachDiscordCookie(badRes, discordFlowTmp);

      return badRes;
    }

    // parse querystring dessa request
    // ex: /login?redirect=http%3A%2F%2Flocalhost%3A3000%2Flink%2Fdiscord
    const url = new URL(req.url);
    const queryNext = url.searchParams.get("next"); // ex: /link/discord
    const queryRedirect = url.searchParams.get("redirect"); // ex: http://localhost:3000/link/discord

    // descobre AGORA se é o fluxo especial do Discord
    // isso vale pra toda a resposta desse POST
    const discordFlowNow = isDiscordFlowRequested(queryRedirect);

    // cookie temporário possível vindo de etapa anterior
    const cookieNext = req.cookies.get(NEXT_COOKIE_NAME)?.value || null;

    // busca user no DB
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);
    const user = (rows as any)[0];

    // 1) Usuário não existe -> front entende que é registro
    if (!user) {
      const resNewUser = NextResponse.json({ newUser: true });

      // seta cookie do fluxo discord se for o caso
      attachDiscordCookie(resNewUser, discordFlowNow);

      // também persistimos intenção /link/discord pra próxima etapa via NEXT_COOKIE_NAME
      if (queryNext && queryNext.startsWith("/")) {
        const isProd = process.env.NODE_ENV === "production";
        resNewUser.cookies.set(NEXT_COOKIE_NAME, queryNext, {
          httpOnly: true,
          secure: isProd,
          sameSite: "lax",
          path: "/",
          maxAge: 300,
        });
      }

      return resNewUser;
    }

    // 2) Usuário existe mas ainda não mandou senha
    if (!password) {
      const resStepPassword = NextResponse.json({
        needPassword: true,
      });

      attachDiscordCookie(resStepPassword, discordFlowNow);

      if (queryNext && queryNext.startsWith("/")) {
        const isProd = process.env.NODE_ENV === "production";
        resStepPassword.cookies.set(NEXT_COOKIE_NAME, queryNext, {
          httpOnly: true,
          secure: isProd,
          sameSite: "lax",
          path: "/",
          maxAge: 300,
        });
      }

      return resStepPassword;
    }

    // 3) Validar senha
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const badPwRes = NextResponse.json(
        { error: "Email ou senha incorretos" },
        { status: 401 }
      );

      attachDiscordCookie(badPwRes, discordFlowNow);
      return badPwRes;
    }

    // --- login OK a partir daqui ---

    // coleta metadados
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("fastly-client-ip") ||
      "0.0.0.0";

    const ua = req.headers.get("user-agent") || "Desconhecido";
    const { browser, os } = parseUserAgent(ua);

    let geo: any = {};
    try {
      const r = await axios.get(`https://ipapi.co/${ip}/json/`, {
        timeout: 3000,
      });
      geo = r.data || {};
    } catch {
      geo = {};
    }

    // gera sessão
    const sessionId = uuidv4();

    const sessionToken = jwt.sign(
      { uid: user.id, sid: sessionId },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    const expireToken = jwt.sign(
      { uid: user.id, sid: sessionId },
      JWT_SECRET,
      { expiresIn: "25h" }
    );

    // log de acesso
    await db.query(
      `INSERT INTO logins (
        user_id, ip, browser, os, region, country, state, city,
        latitude, longitude, isp, timezone, cookie_session, cookie_expire
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        ip,
        browser,
        os,
        geo.region || "",
        geo.country_name || "",
        geo.region_code || "",
        geo.city || "",
        geo.latitude || 0,
        geo.longitude || 0,
        geo.org || "",
        geo.timezone || "",
        sessionToken,
        expireToken,
      ]
    );

    // decide redirect final pra mandar de volta pro front
    const finalRedirect = pickFinalRedirect({
      queryRedirect,
      queryNext,
      bodyNext: nextFromBody || null,
      cookieNext,
    });

    const resOK = NextResponse.json({
      success: true,
      redirect: finalRedirect,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    });

    // sempre anexar esse cookie se fluxo discord foi detectado nessa request
    attachDiscordCookie(resOK, discordFlowNow);

    // cookies de sessão Wyze
    const isProd = process.env.NODE_ENV === "production";
    const baseCookieOpts = {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax" as const,
      path: "/",
    };

    resOK.cookies.set("wzb_lg", sessionToken, {
      ...baseCookieOpts,
      maxAge: 86400, // 24h
    });

    resOK.cookies.set("wzb_lg_e", expireToken, {
      ...baseCookieOpts,
      maxAge: 90000, // 25h
    });

    // limpar o cookie NEXT_COOKIE_NAME, ele só serve pré-senha
    resOK.cookies.set(NEXT_COOKIE_NAME, "", {
      ...baseCookieOpts,
      maxAge: 0,
    });

    return resOK;
  } catch (err: any) {
    console.error("[LOGIN ERROR]", err);

    // mesmo erro interno ainda tenta anexar cookie se for fluxo discord
    const fallbackRes = NextResponse.json(
      { error: "Erro interno no servidor" },
      { status: 500 }
    );

    const urlTmp = new URL(req.url);
    const queryRedirectTmp = urlTmp.searchParams.get("redirect");
    const discordFlowTmp = isDiscordFlowRequested(queryRedirectTmp);
    attachDiscordCookie(fallbackRes, discordFlowTmp);

    return fallbackRes;
  }
}
