// app/api/discord-vn/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { db } from "../db";

export const runtime = "nodejs";
dotenv.config();

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI!;
const JWT_SECRET = process.env.JWT_SECRET!;

const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME || "discord_session";
const SESSION_COOKIE_SECRET =
  process.env.SESSION_COOKIE_SECRET ||
  "wyze_default_session_pepper_change_me";

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_REDIRECT_URI) {
  throw new Error(
    "❌ Faltando DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET / DISCORD_REDIRECT_URI no .env"
  );
}

/* -------------------------------------------------
   1. pega usuário Wyze logado via cookie wzb_lg
------------------------------------------------- */
async function getWyzeUserFromCookies(req: NextRequest) {
  const sessionJwt = req.cookies.get("wzb_lg")?.value;
  if (!sessionJwt) return null;

  try {
    const payload = jwt.verify(sessionJwt, JWT_SECRET) as {
      uid: number;
      sid: string;
      iat: number;
      exp: number;
    };

    if (!payload?.uid) return null;

    // valida que essa sessão realmente existe na tabela logins
    const [rows] = await db.query(
      "SELECT user_id FROM logins WHERE cookie_session = ? LIMIT 1",
      [sessionJwt]
    );
    const loginRow = (rows as any[])[0];
    if (!loginRow) {
      return null;
    }

    // pega os dados do usuário Wyze
    const [uRows] = await db.query(
      "SELECT id, email, name, discord_id, discord_username, discord_avatar FROM users WHERE id=? LIMIT 1",
      [payload.uid]
    );
    const user = (uRows as any[])[0];
    if (!user) return null;

    return user;
  } catch {
    return null;
  }
}

/* -------------------------------------------------
   2. monta URL de autorização do Discord
------------------------------------------------- */
function buildDiscordAuthUrl(state?: string) {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: "code",
    scope: "identify",
  });

  if (state) params.set("state", state);

  // TEM que ser https://discord.com/oauth2/... (não http)
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

/* -------------------------------------------------
   3. gera token de sessão Discord (cookie interno)
------------------------------------------------- */
function generateSessionToken() {
  const raw = randomBytes(32).toString("hex");
  const h = createHash("sha256");
  h.update(raw + SESSION_COOKIE_SECRET);
  return h.digest("hex");
}

/* -------------------------------------------------
   4. IP + UA
------------------------------------------------- */
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

/* -------------------------------------------------
   5. checar sessão Discord atual (cookie discord_session)
------------------------------------------------- */
async function getDiscordSessionFromCookie(req: NextRequest) {
  const cookieVal = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!cookieVal) return null;

  const [rows] = await db.query(
    `SELECT s.*, u.id as wyze_user_id, u.name, u.email
     FROM discord_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.session_token=? LIMIT 1`,
    [cookieVal]
  );
  const row = (rows as any[])[0];
  if (!row) return null;

  return {
    discord_id: row.discord_id,
    discord_username: row.discord_username,
    discord_avatar: row.discord_avatar,
    wyze_user_id: row.wyze_user_id,
  };
}

/* -------------------------------------------------
   6. troca "code" -> access_token no Discord
      IMPORTANTE: usar HTTPS e content-type correto
------------------------------------------------- */
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
    body, // URLSearchParams já serializa no formato correto
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

/* -------------------------------------------------
   7. pega perfil do usuário no Discord
      (precisa do access_token)
------------------------------------------------- */
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

/* -------------------------------------------------
   8. salva sessão Discord no banco
------------------------------------------------- */
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
    `INSERT INTO discord_sessions
      (session_token, user_id, discord_id, discord_username, discord_avatar, access_token, ip, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
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

/* -------------------------------------------------
   GET /api/discord-vn
   - garante Wyze logado
   - se já tem Discord vinculado => ready:true
   - senão, devolve URL de auth do Discord
   - se nem Wyze logado, devolve needLogin:true
------------------------------------------------- */
export async function GET(req: NextRequest) {
  try {
    const wyzeUser = await getWyzeUserFromCookies(req);

    // não logado na Wyze -> manda pro login com redirect já preparado
    if (!wyzeUser) {
      return NextResponse.json({
        ready: false,
        needLogin: true,
        loginUrl:
          "/login?redirect=" +
          encodeURIComponent("https://wyzebank.com/link/discord"),
      });
    }

    // já tem discord salvo no perfil do usuário
    if (wyzeUser.discord_id) {
      return NextResponse.json({
        ready: true,
        user: {
          id: wyzeUser.discord_id,
          username: wyzeUser.discord_username || wyzeUser.name,
          avatar: wyzeUser.discord_avatar || null,
        },
      });
    }

    // checa se já tem sessão Discord nessa aba
    const discSession = await getDiscordSessionFromCookie(req);
    if (discSession && discSession.wyze_user_id === wyzeUser.id) {
      return NextResponse.json({
        ready: true,
        user: {
          id: discSession.discord_id,
          username: discSession.discord_username,
          avatar: discSession.discord_avatar,
        },
      });
    }

    // se não tem vínculo ainda -> gerar URL do Discord OAuth
    const state = randomBytes(8).toString("hex");
    const discordAuthUrl = buildDiscordAuthUrl(state);

    return NextResponse.json({
      ready: false,
      needLogin: false,
      discordAuthUrl,
    });
  } catch (err: any) {
    console.error("[DISCORD GET ERROR]", err);
    return NextResponse.json(
      { error: err.message || "Erro interno" },
      { status: 500 }
    );
  }
}

/* -------------------------------------------------
   POST /api/discord-vn
   - chamado quando voltamos do Discord com ?code=...
   - precisa Wyze logado
   - troca code pelo token
   - pega perfil
   - vincula na tabela users
   - cria sessão Discord + cookie
------------------------------------------------- */
export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json();
    if (!code) {
      return NextResponse.json(
        { error: "Código OAuth ausente." },
        { status: 400 }
      );
    }

    // tem que estar logado na Wyze
    const wyzeUser = await getWyzeUserFromCookies(req);
    if (!wyzeUser) {
      return NextResponse.json(
        {
          error:
            "Você precisa estar logado na sua conta Wyze Bank antes de vincular o Discord.",
          needLogin: true,
          loginUrl:
            "/login?redirect=" +
            encodeURIComponent("https://wyzebank.com/link/discord"),
        },
        { status: 401 }
      );
    }

    // se já tem Discord vinculado, devolve direto
    if (wyzeUser.discord_id) {
      return NextResponse.json({
        success: true,
        alreadyLinked: true,
        redirect: "https://wyzebank.com/link/discord",
        user: {
          id: wyzeUser.discord_id,
          username: wyzeUser.discord_username || wyzeUser.name,
          avatar: wyzeUser.discord_avatar || null,
        },
      });
    }

    const { ip, userAgent } = getRequestMeta(req);

    // troca code -> access_token (esse era o ponto que tava quebrando: agora HTTPS + runtime nodejs)
    const tokenData = await exchangeCodeForToken(code);

    // pega /users/@me
    const discordUser = await fetchDiscordUser(tokenData.access_token);

    const discord_id = discordUser.id;
    const displayName =
      discordUser.global_name ||
      (discordUser.discriminator && discordUser.discriminator !== "0"
        ? `${discordUser.username}#${discordUser.discriminator}`
        : discordUser.username);

    const avatarHash = discordUser.avatar || null;

    // garantir que esse Discord não está em OUTRA conta Wyze
    const [takenRows] = await db.query(
      "SELECT id FROM users WHERE discord_id = ? LIMIT 1",
      [discord_id]
    );
    const takenUser = (takenRows as any[])[0];
    if (takenUser && takenUser.id !== wyzeUser.id) {
      return NextResponse.json(
        {
          error: "Este Discord já está vinculado a outra conta Wyze Bank.",
        },
        { status: 409 }
      );
    }

    // salvar vínculo no usuário Wyze
    await db.query(
      `UPDATE users
       SET discord_id = ?, discord_username = ?, discord_avatar = ?
       WHERE id = ?`,
      [discord_id, displayName, avatarHash, wyzeUser.id]
    );

    // criar sessão Discord dedicada pra essa aba
    const session_token = await createDiscordSession({
      wyzeUserId: wyzeUser.id,
      discord_id,
      discord_username: displayName,
      discord_avatar: avatarHash,
      access_token: tokenData.access_token,
      ip,
      userAgent,
    });

    // montar resposta pro front e setar cookie httpOnly discord_session
    const res = NextResponse.json({
      success: true,
      redirect: "https://wyzebank.com/link/discord",
      user: {
        id: discord_id,
        username: displayName,
        avatar: avatarHash,
      },
    });

    const isProd = process.env.NODE_ENV === "production";
    res.cookies.set(SESSION_COOKIE_NAME, session_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60, // 1h
    });

    return res;
  } catch (err: any) {
    console.error("[DISCORD POST ERROR]", err);
    return NextResponse.json(
      { error: err.message || "Erro ao validar Discord" },
      { status: 500 }
    );
  }
}
