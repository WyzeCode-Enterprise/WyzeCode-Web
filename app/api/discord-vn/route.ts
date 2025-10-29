// app/api/discord-vn/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { db } from "../db";

export const runtime = "nodejs";
dotenv.config();

/* ──────────────────────────────────────────────
   ENV
────────────────────────────────────────────── */
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI!;
const JWT_SECRET = process.env.JWT_SECRET!;

const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME || "discord_session";

const SESSION_COOKIE_SECRET =
  process.env.SESSION_COOKIE_SECRET ||
  "wyze_default_session_pepper_change_me";

const POSTLOGIN_REDIRECT_COOKIE =
  process.env.POSTLOGIN_REDIRECT_COOKIE || "wzb_postlogin_redirect";

const IS_PROD = process.env.NODE_ENV === "production";

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_REDIRECT_URI) {
  throw new Error(
    "❌ Faltando DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET / DISCORD_REDIRECT_URI no .env"
  );
}

/* ──────────────────────────────────────────────
   UTIL COMUM: resposta JSON sem cache
────────────────────────────────────────────── */
function jsonNoStore(data: any, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/* ──────────────────────────────────────────────
   1. Validar usuário Wyze logado via cookie wzb_lg
   - Corrigido para parar loop infinito
   - Regras:
     • precisa existir cookie wzb_lg
     • wzb_lg = JWT assinado com JWT_SECRET
     • payload.uid e payload.sid precisam existir
     • precisa existir linha em `logins` que corresponda
       ao mesmo user_id E (cookie_session = wzb_lg OU session_id = sid)
     • pega usuário na tabela users
────────────────────────────────────────────── */
async function getWyzeUserFromCookies(req: NextRequest) {
  const sessionJwt = req.cookies.get("wzb_lg")?.value;
  if (!sessionJwt) return null;

  let payload: {
    uid: number;
    sid: string;
    iat: number;
    exp: number;
  };

  try {
    payload = jwt.verify(sessionJwt, JWT_SECRET) as any;
  } catch {
    return null;
  }

  if (!payload || !payload.uid || !payload.sid) {
    return null;
  }

  // conferir se a sessão realmente existe
  // Obs: muitas implementações salvam tanto o token jwt em `cookie_session`
  // quanto um "session_id" simples (sid) na mesma linha ou outra linha;
  // aceitamos qualquer uma das combinações para evitar falso negativo.
  const [loginRows] = await db.query(
    `
      SELECT user_id
      FROM logins
      WHERE user_id = ?
        AND (
          cookie_session = ?
          OR session_id = ?
        )
      LIMIT 1
    `,
    [payload.uid, sessionJwt, payload.sid]
  );
  const loginRow = (loginRows as any[])[0];
  if (!loginRow) {
    // sessão não é reconhecida no banco => trata como deslogado
    return null;
  }

  // agora pega o usuário real
  const [uRows] = await db.query(
    `
      SELECT
        id,
        email,
        name,
        discord_id,
        discord_username,
        discord_avatar
      FROM users
      WHERE id = ?
      LIMIT 1
    `,
    [payload.uid]
  );

  const user = (uRows as any[])[0];
  if (!user) return null;

  return {
    id: user.id as number,
    email: user.email as string,
    name: user.name as string,
    discord_id: user.discord_id as string | null,
    discord_username: user.discord_username as string | null,
    discord_avatar: user.discord_avatar as string | null,
  };
}

/* ──────────────────────────────────────────────
   2. Monta URL OAuth Discord
────────────────────────────────────────────── */
function buildDiscordAuthUrl(state?: string) {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify",
  });

  if (state) params.set("state", state);

  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

/* ──────────────────────────────────────────────
   3. Gera token de sessão Discord interno
────────────────────────────────────────────── */
function generateSessionToken() {
  const raw = randomBytes(32).toString("hex");
  const h = createHash("sha256");
  h.update(raw + SESSION_COOKIE_SECRET);
  return h.digest("hex");
}

/* ──────────────────────────────────────────────
   4. IP + UA
────────────────────────────────────────────── */
function getRequestMeta(req: NextRequest) {
  const xf = req.headers.get("x-forwarded-for");
  const ip = xf
    ? xf.split(",")[0].trim()
    : req.headers.get("cf-connecting-ip") ||
      req.headers.get("fastly-client-ip") ||
      // @ts-ignore
      req.ip ||
      "unknown";

  const userAgent = req.headers.get("user-agent") || "unknown";
  return { ip, userAgent };
}

/* ──────────────────────────────────────────────
   5. checar sessão Discord atual (cookie discord_session)
   Usa JOIN pra já trazer o user correspondente
────────────────────────────────────────────── */
async function getDiscordSessionFromCookie(req: NextRequest) {
  const cookieVal = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!cookieVal) return null;

  const [rows] = await db.query(
    `
    SELECT
      s.discord_id,
      s.discord_username,
      s.discord_avatar,
      u.id   AS wyze_user_id,
      u.name AS wyze_name,
      u.email AS wyze_email
    FROM discord_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.session_token = ?
    LIMIT 1
  `,
    [cookieVal]
  );

  const row = (rows as any[])[0];
  if (!row) return null;

  return {
    discord_id: row.discord_id as string,
    discord_username: row.discord_username as string,
    discord_avatar: row.discord_avatar as string | null,
    wyze_user_id: row.wyze_user_id as number,
    wyze_name: row.wyze_name as string,
    wyze_email: row.wyze_email as string,
  };
}

/* ──────────────────────────────────────────────
   6. Troca code -> access_token no Discord
────────────────────────────────────────────── */
async function exchangeCodeForToken(code: string) {
  const body = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: DISCORD_REDIRECT_URI,
    scope: "identify",
  });

  const resp = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(
      `Falha ao trocar code por token no Discord: ${resp.status} ${errText}`
    );
  }

  return (await resp.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
    refresh_token?: string;
  };
}

/* ──────────────────────────────────────────────
   7. /users/@me no Discord
────────────────────────────────────────────── */
async function fetchDiscordUser(access_token: string) {
  const resp = await fetch("https://discord.com/api/users/@me", {
    headers: {
      Authorization: `Bearer ${access_token}`,
    },
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(
      `Falha ao obter perfil do Discord: ${resp.status} ${errText}`
    );
  }

  return (await resp.json()) as {
    id: string;
    username: string;
    global_name?: string;
    avatar?: string;
    discriminator?: string;
  };
}

/* ──────────────────────────────────────────────
   8. Cria sessão Discord dedicada
────────────────────────────────────────────── */
async function createDiscordSession({
  wyzeUserId,
  discord_id,
  discord_username,
  discord_avatar,
  access_token,
  ip,
  userAgent,
}: {
  wyzeUserId: number;
  discord_id: string;
  discord_username: string;
  discord_avatar: string | null;
  access_token: string;
  ip: string;
  userAgent: string;
}) {
  const session_token = generateSessionToken();

  await db.query(
    `
    INSERT INTO discord_sessions
      (session_token, user_id, discord_id, discord_username, discord_avatar, access_token, ip, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
  `,
    [
      session_token,
      wyzeUserId,
      discord_id,
      discord_username,
      discord_avatar,
      access_token,
      ip,
      userAgent,
    ]
  );

  return session_token;
}

/* ──────────────────────────────────────────────
   9. helper limpar wzb_postlogin_redirect
   regra:
   se o user já tá logado (wzb_lg + wzb_lg_e)
   e agora ele vai ter também discord_session,
   então não precisamos mais do cookie de redirect.
────────────────────────────────────────────── */
function cleanupPostloginRedirectCookie(req: NextRequest, res: NextResponse) {
  const hasWyzeSession = Boolean(req.cookies.get("wzb_lg")?.value);
  const hasWyzeSessionE = Boolean(req.cookies.get("wzb_lg_e")?.value);

  if (hasWyzeSession && hasWyzeSessionE) {
    res.cookies.set(POSTLOGIN_REDIRECT_COOKIE, "", {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: "lax",
      path: "/",
      maxAge: 0, // apaga
    });
  }
}

/* ──────────────────────────────────────────────
   GET /api/discord-vn
   Fluxo:
   1. Se não está logado Wyze -> status NEED_LOGIN
   2. Se já tem discord_id salvo -> status READY
   3. Se tem sessão discord_session salva -> status READY
   4. Caso contrário -> precisa iniciar OAuth Discord
────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  try {
    const wyzeUser = await getWyzeUserFromCookies(req);

    // 1) usuário NÂO logado na plataforma Wyze
    if (!wyzeUser) {
      return jsonNoStore({
        status: "NEED_LOGIN",
        user: null,
        discordAuthUrl: null,
        loginUrl:
          "/login?redirect=" +
          encodeURIComponent("https://wyzebank.com/link/discord"),
      });
    }

    // 2) usuário logado e já vinculado ao Discord na tabela users
    if (wyzeUser.discord_id) {
      return jsonNoStore({
        status: "READY",
        user: {
          id: wyzeUser.discord_id,
          username: wyzeUser.discord_username || wyzeUser.name,
          avatar: wyzeUser.discord_avatar || null,
        },
        discordAuthUrl: null,
      });
    }

    // 3) ainda não está salvo em users, mas já criamos discord_session
    const discSession = await getDiscordSessionFromCookie(req);
    if (discSession && discSession.wyze_user_id === wyzeUser.id) {
      return jsonNoStore({
        status: "READY",
        user: {
          id: discSession.discord_id,
          username: discSession.discord_username,
          avatar: discSession.discord_avatar,
        },
        discordAuthUrl: null,
      });
    }

    // 4) precisa autorizar no Discord
    const state = randomBytes(8).toString("hex");
    const discordAuthUrl = buildDiscordAuthUrl(state);

    return jsonNoStore({
      status: "NEED_DISCORD_AUTH",
      user: null,
      discordAuthUrl,
    });
  } catch (err: any) {
    console.error("[DISCORD GET ERROR]", err);
    return jsonNoStore(
      {
        status: "ERROR",
        error: err?.message || "Erro interno",
      },
      500
    );
  }
}

/* ──────────────────────────────────────────────
   POST /api/discord-vn
   Body: { code: string }
   Fluxo:
   - Precisa já estar logado Wyze.
   - Troca code -> token Discord.
   - /users/@me
   - Verifica se esse Discord já está vinculado a outra conta.
   - Atualiza tabela users com discord_id/username/avatar.
   - Cria sessão Discord + cookie.
   - Limpa wzb_postlogin_redirect se já pode.
────────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();
    if (!code) {
      return jsonNoStore({ error: "Código OAuth ausente." }, 400);
    }

    // precisa estar logado Wyze
    const wyzeUser = await getWyzeUserFromCookies(req);
    if (!wyzeUser) {
      return jsonNoStore(
        {
          status: "NEED_LOGIN",
          error:
            "Você precisa estar logado na sua conta Wyze Bank antes de vincular o Discord.",
          needLogin: true,
          loginUrl:
            "/login?redirect=" +
            encodeURIComponent("https://wyzebank.com/link/discord"),
        },
        401
      );
    }

    // se já estava vinculado antes, não precisa re-vincular
    if (wyzeUser.discord_id) {
      const res = jsonNoStore({
        status: "LINKED",
        alreadyLinked: true,
        redirect: "/link/discord",
        user: {
          id: wyzeUser.discord_id,
          username: wyzeUser.discord_username || wyzeUser.name,
          avatar: wyzeUser.discord_avatar || null,
        },
      });

      // limpar cookie de redirect se já temos tudo
      cleanupPostloginRedirectCookie(req, res);
      return res;
    }

    const { ip, userAgent } = getRequestMeta(req);

    // troca code por token no Discord
    const tokenData = await exchangeCodeForToken(code);

    // pega dados /users/@me
    const discordUser = await fetchDiscordUser(tokenData.access_token);

    const discord_id = discordUser.id;
    const displayName =
      discordUser.global_name ||
      (discordUser.discriminator && discordUser.discriminator !== "0"
        ? `${discordUser.username}#${discordUser.discriminator}`
        : discordUser.username);

    const avatarHash = discordUser.avatar || null;

    // checar se esse Discord já está vinculado a OUTRA conta
    const [takenRows] = await db.query(
      "SELECT id FROM users WHERE discord_id = ? LIMIT 1",
      [discord_id]
    );
    const takenUser = (takenRows as any[])[0];
    if (takenUser && takenUser.id !== wyzeUser.id) {
      return jsonNoStore(
        {
          status: "CONFLICT",
          error: "Este Discord já está vinculado a outra conta Wyze Bank.",
        },
        409
      );
    }

    // salvar vínculo Discord no próprio usuário
    await db.query(
      `
      UPDATE users
      SET discord_id = ?, discord_username = ?, discord_avatar = ?
      WHERE id = ?
    `,
      [discord_id, displayName, avatarHash, wyzeUser.id]
    );

    // criar sessão Discord dedicada
    const session_token = await createDiscordSession({
      wyzeUserId: wyzeUser.id,
      discord_id,
      discord_username: displayName,
      discord_avatar: avatarHash,
      access_token: tokenData.access_token,
      ip,
      userAgent,
    });

    // montar resposta final
    const res = jsonNoStore({
      status: "LINKED",
      redirect: "/link/discord",
      user: {
        id: discord_id,
        username: displayName,
        avatar: avatarHash,
      },
    });

    // set cookie discord_session
    res.cookies.set(SESSION_COOKIE_NAME, session_token, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60, // 1h
    });

    // limpar pós-login se já podemos
    cleanupPostloginRedirectCookie(req, res);

    return res;
  } catch (err: any) {
    console.error("[DISCORD POST ERROR]", err);
    return jsonNoStore(
      {
        status: "ERROR",
        error: err?.message || "Erro ao validar Discord",
      },
      500
    );
  }
}
