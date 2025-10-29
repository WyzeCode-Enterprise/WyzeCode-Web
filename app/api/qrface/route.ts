import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import crypto from "crypto";
import jwt from "jsonwebtoken";

/**
 * CONFIG
 */
const TOKEN_LIFETIME_MIN = 5;
const EXPIRE_GRACE_SECONDS = 2;

const FACE_SESSION_SECRET =
  process.env.FACE_SESSION_SECRET ||
  process.env.JWT_SECRET ||
  "supersecretkey";

/**
 * Gera token interno grande só pra auditoria (não vai no QR direto).
 */
function generateInternalToken() {
  return crypto.randomBytes(150).toString("base64url");
}

/**
 * Código humano curto de suporte
 */
function generateWCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Cookie de sessão do dashboard (login web)
 */
function getSessionCookie(req: NextRequest): string | null {
  const cookieHeader = req.headers.get("cookie") || "";
  const found = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("wzb_lg="));
  if (!found) return null;
  return found.replace("wzb_lg=", "");
}

/**
 * Decodifica JWT do dashboard e extrai user_id
 */
function getUserIdFromSessionToken(rawToken: string | null): number | null {
  if (!rawToken) return null;
  try {
    const decoded: any = jwt.verify(
      rawToken,
      process.env.JWT_SECRET || "supersecretkey"
    );
    if (!decoded || !decoded.uid) return null;
    return decoded.uid;
  } catch (err) {
    console.error("[qrface] JWT inválido:", err);
    return null;
  }
}

/**
 * Cria um ticket curto assinado pro fluxo da selfie.
 * payload.min -> { sid }
 */
function signFaceSessionTicket(sessionId: number) {
  const payload = { sid: sessionId };
  const expiresInSec = TOKEN_LIFETIME_MIN * 60 + EXPIRE_GRACE_SECONDS;
  return jwt.sign(payload, FACE_SESSION_SECRET, { expiresIn: expiresInSec });
}

/**
 * Valida/decodifica o ticket curto.
 */
function verifyFaceSessionTicket(ticket: string | null): { sid: number } | null {
  if (!ticket) return null;
  try {
    const decoded = jwt.verify(ticket, FACE_SESSION_SECRET) as any;
    if (!decoded || typeof decoded.sid !== "number") return null;
    return { sid: decoded.sid };
  } catch (err) {
    console.warn("[qrface] session ticket inválido/expirado:", err);
    return null;
  }
}

/**
 * Sanity check simples pra imagem base64
 */
function isLikelySafeDataUrl(img: string): boolean {
  if (typeof img !== "string") return false;
  if (!img.startsWith("data:image/")) return false;
  if (img.length > 2_600_000) return false; // ~2.6MB base64 máx
  return true;
}

/**
 * Marca sessões antigas 'pending_face' desse user como 'expired'
 * se já passou o prazo + grace.
 */
async function expireStaleTokensForUser(userId: number) {
  await db.query(
    `
      UPDATE wzb_tokens
      SET status = 'expired'
      WHERE user_id = ?
        AND status = 'pending_face'
        AND expires_at < (NOW() - INTERVAL ? SECOND)
    `,
    [userId, EXPIRE_GRACE_SECONDS]
  );
}

/**
 * Verifica se um expires_at já passou (com pequena folga)
 */
function isExpiredWithGrace(expires_at: any): boolean {
  if (!expires_at) return false;
  const expMs = new Date(expires_at).getTime();
  const nowMs = Date.now();
  return expMs + EXPIRE_GRACE_SECONDS * 1000 < nowMs;
}

/**
 * Busca info da sessão pelo ID interno
 */
async function fetchSessionRowById(sessionId: number) {
  const [rows] = await db.query(
    `
      SELECT 
        t.id            AS token_id,
        t.status        AS token_status,
        t.expires_at    AS expires_at,
        pv.selfie_b64   AS selfie_b64
      FROM wzb_tokens t
      LEFT JOIN pending_validations pv
        ON pv.token_id = t.id
      WHERE t.id = ?
      LIMIT 1
    `,
    [sessionId]
  );

  const row = (rows as any[])[0];
  if (!row) return null;

  return {
    token_id: row.token_id,
    status: row.token_status,
    expires_at: row.expires_at,
    selfie_b64: row.selfie_b64 || null,
  };
}

/* =========================================================================
   POST /api/qrface
   - Dashboard logado chama
   - Gera ou reusa sessão de prova de vida
   - Retorna:
     {
       success,
       session,      // ticket JWT curto
       url,          // link https://.../qrface?session=...
       selfie_b64?,  // se já capturada
       status        // pending_face | face_captured
     }
 ========================================================================= */
export async function POST(req: NextRequest) {
  try {
    const rawSession = getSessionCookie(req);
    const userId = getUserIdFromSessionToken(rawSession);
    if (!userId) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    // expira "pending_face" antigo desse usuário
    await expireStaleTokensForUser(userId);

    // tenta achar sessão ativa
    const [activeRows] = await db.query(
      `
        SELECT
          t.id            AS token_row_id,
          t.status        AS token_status,
          t.expires_at    AS expires_at,
          pv.selfie_b64   AS selfie_b64
        FROM wzb_tokens t
        LEFT JOIN pending_validations pv
          ON pv.token_id = t.id
        WHERE t.user_id = ?
          AND t.status IN ('pending_face','face_captured')
        ORDER BY t.created_at DESC
        LIMIT 1
      `,
      [userId]
    );

    const active = (activeRows as any[])[0];

    if (active) {
      // gera ticket curto pro QR
      const sessionTicket = signFaceSessionTicket(active.token_row_id);

      return NextResponse.json({
        success: true,
        session: sessionTicket,
        url: `https://wyzebank.com/qrface?session=${encodeURIComponent(
          sessionTicket
        )}`,
        selfie_b64: active.selfie_b64 || null,
        status: active.token_status,
      });
    }

    // se não tem nada ativo, cria
    const internalToken = generateInternalToken();
    const wCode = generateWCode();

    const insertRes: any = await db.query(
      `
        INSERT INTO wzb_tokens (
          token,
          user_id,
          w_code,
          status,
          created_at,
          used_at,
          expires_at
        )
        VALUES (
          ?,               -- token interno randômico
          ?,               -- user_id
          ?,               -- w_code humano
          'pending_face',  -- status inicial
          NOW(),
          NULL,
          DATE_ADD(NOW(), INTERVAL ${TOKEN_LIFETIME_MIN} MINUTE)
        )
      `,
      [internalToken, userId, wCode]
    );

    const insertedInfo = Array.isArray(insertRes) ? insertRes[0] : insertRes;
    const newTokenRowId = insertedInfo.insertId as number;

    // cria pending_validations vazia
    await db.query(
      `
        INSERT INTO pending_validations (
          token_id,
          qr_token,
          w_code,
          selfie_b64,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, NULL, NOW(), NOW())
      `,
      [newTokenRowId, internalToken, wCode]
    );

    // ticket curto assinado
    const sessionTicket = signFaceSessionTicket(newTokenRowId);

    return NextResponse.json({
      success: true,
      session: sessionTicket,
      url: `https://wyzebank.com/qrface?session=${encodeURIComponent(
        sessionTicket
      )}`,
      selfie_b64: null,
      status: "pending_face",
    });
  } catch (err: any) {
    console.error("[QRFACE POST ERROR]", err);
    return NextResponse.json(
      { error: err.message || "Erro interno" },
      { status: 500 }
    );
  }
}

/* =========================================================================
   PUT /api/qrface
   - Celular envia selfie
   Body: { session: string, selfieDataUrl: string }
 ========================================================================= */
export async function PUT(req: NextRequest) {
  try {
    const { session, selfieDataUrl } = await req.json();

    if (!session || !selfieDataUrl) {
      return NextResponse.json(
        { error: "session e selfieDataUrl são obrigatórios." },
        { status: 400 }
      );
    }

    if (!isLikelySafeDataUrl(selfieDataUrl)) {
      return NextResponse.json(
        { error: "Imagem inválida ou muito grande." },
        { status: 400 }
      );
    }

    const decoded = verifyFaceSessionTicket(session);
    if (!decoded) {
      return NextResponse.json(
        { error: "Sessão inválida ou expirada." },
        { status: 400 }
      );
    }

    const sess = await fetchSessionRowById(decoded.sid);
    if (!sess) {
      return NextResponse.json(
        { error: "Sessão não encontrada." },
        { status: 404 }
      );
    }

    // salva selfie
    await db.query(
      `
        UPDATE pending_validations
        SET selfie_b64 = ?, updated_at = NOW()
        WHERE token_id = ?
      `,
      [selfieDataUrl, sess.token_id]
    );

    // marca como face_captured
    await db.query(
      `
        UPDATE wzb_tokens
        SET status = 'face_captured',
            used_at = NOW()
        WHERE id = ?
      `,
      [sess.token_id]
    );

    return NextResponse.json({
      success: true,
      message: "Selfie recebida com sucesso.",
      selfiePreview: selfieDataUrl,
    });
  } catch (err: any) {
    console.error("[QRFACE PUT ERROR]", err);
    return NextResponse.json(
      { error: err.message || "Erro interno" },
      { status: 500 }
    );
  }
}

/* =========================================================================
   GET /api/qrface?session=...
   - usado no dashboard (polling) e no celular ao abrir
 ========================================================================= */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionTicket = searchParams.get("session");

    if (!sessionTicket) {
      return NextResponse.json(
        { error: "session é obrigatório." },
        { status: 400 }
      );
    }

    const decoded = verifyFaceSessionTicket(sessionTicket);
    if (!decoded) {
      return NextResponse.json(
        { error: "Sessão inválida ou expirada." },
        { status: 400 }
      );
    }

    const sess = await fetchSessionRowById(decoded.sid);
    if (!sess) {
      return NextResponse.json(
        { error: "Sessão não encontrada." },
        { status: 404 }
      );
    }

    const expiredNow = isExpiredWithGrace(sess.expires_at);

    return NextResponse.json({
      success: true,
      status:
        expiredNow && sess.status === "pending_face"
          ? "expired"
          : sess.status,
      selfie_b64: sess.selfie_b64 || null,
    });
  } catch (err: any) {
    console.error("[QRFACE GET ERROR]", err);
    return NextResponse.json(
      { error: err.message || "Erro interno" },
      { status: 500 }
    );
  }
}
