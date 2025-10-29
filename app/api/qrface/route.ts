import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import crypto from "crypto";
import jwt from "jsonwebtoken";

/**
 * IMPORTANTE:
 * força essa rota a ser sempre dinâmica e sem cache
 * (Next não vai tentar cachear em edge / static).
 */
export const dynamic = "force-dynamic";

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
 * -> mesmo esquema do login.ts que você mandou
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
 * -> igual o login
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
 * Cria token curto assinado que vai pro celular.
 * payload mínimo -> { sid: <id interno da sessão> }
 */
function signFaceSessionTicket(sessionId: number) {
  const payload = { sid: sessionId };
  const expiresInSec = TOKEN_LIFETIME_MIN * 60 + EXPIRE_GRACE_SECONDS;
  return jwt.sign(payload, FACE_SESSION_SECRET, { expiresIn: expiresInSec });
}

/**
 * Lê o ticket curto e devolve { sid } ou null se inválido / expirado
 */
function verifyFaceSessionTicket(
  ticket: string | null
): { sid: number } | null {
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
 * sanity check básico da imagem
 * - tem que ser data:image/...
 * - limite de ~2.6MB base64
 */
function isLikelySafeDataUrl(img: string): boolean {
  if (typeof img !== "string") return false;
  if (!img.startsWith("data:image/")) return false;
  if (img.length > 2_600_000) return false;
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
 * Verifica se expires_at já passou (com pequena folga)
 */
function isExpiredWithGrace(expires_at: any): boolean {
  if (!expires_at) return false;
  const expMs = new Date(expires_at).getTime();
  const nowMs = Date.now();
  return expMs + EXPIRE_GRACE_SECONDS * 1000 < nowMs;
}

/**
 * Busca sessão pelo ID interno (wzb_tokens.id)
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

/**
 * helper padrão p/ NextResponse.json SEM cache
 */
function jsonNoStore(body: any, init?: { status?: number }) {
  return new NextResponse(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

/* =========================================================================
   POST /api/qrface
   Chamado pelo DASHBOARD logado.
   Fluxo:
   - pega user_id via cookie "wzb_lg"
   - expira sessões antigas pendentes desse user
   - tenta reutilizar uma sessão ativa (pending_face OU face_captured)
   - se não existir, cria nova
   - devolve:
     {
       success,
       session,      // ticket curto pro celular
       url,          // link https://.../qrface?session=...
       selfie_b64,   // se já tem selfie salva
       status        // 'pending_face' | 'face_captured'
     }
 ========================================================================= */
export async function POST(req: NextRequest) {
  try {
    const rawSession = getSessionCookie(req);
    const userId = getUserIdFromSessionToken(rawSession);
    if (!userId) {
      return jsonNoStore(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    // expira sessões 'pending_face' muito antigas
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
      // gera ticket curto pro QR (é esse ticket que o celular manda de volta)
      const sessionTicket = signFaceSessionTicket(active.token_row_id);

      return jsonNoStore({
        success: true,
        session: sessionTicket,
        url: `https://wyzebank.com/qrface?session=${encodeURIComponent(
          sessionTicket
        )}`,
        selfie_b64: active.selfie_b64 || null,
        status: active.token_status, // 'pending_face' ou 'face_captured'
      });
    }

    // se não tem sessão ativa -> cria nova agora
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

    // cria pending_validations vazia linkada
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

    // ticket curto assinado que vai pro QR
    const sessionTicket = signFaceSessionTicket(newTokenRowId);

    return jsonNoStore({
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
    return jsonNoStore(
      { error: err.message || "Erro interno" },
      { status: 500 }
    );
  }
}

/* =========================================================================
   PUT /api/qrface
   Chamado PELO CELULAR depois da captura.
   Body: { session: string, selfieDataUrl: string }
   Fluxo:
   - valida ticket -> sid
   - busca sessão no banco
   - se já expirou e ainda estava pending_face -> recusa
   - se status != pending_face -> recusa
   - salva selfie em pending_validations.selfie_b64
   - atualiza wzb_tokens.status='face_captured'
   - responde já com selfiePreview e status "face_captured"
 ========================================================================= */
export async function PUT(req: NextRequest) {
  try {
    const { session, selfieDataUrl } = await req.json();

    if (!session || !selfieDataUrl) {
      return jsonNoStore(
        { error: "session e selfieDataUrl são obrigatórios." },
        { status: 400 }
      );
    }

    if (!isLikelySafeDataUrl(selfieDataUrl)) {
      return jsonNoStore(
        { error: "Imagem inválida ou muito grande." },
        { status: 400 }
      );
    }

    const decoded = verifyFaceSessionTicket(session);
    if (!decoded) {
      return jsonNoStore(
        { error: "Sessão inválida ou expirada." },
        { status: 400 }
      );
    }

    let sess = await fetchSessionRowById(decoded.sid);
    if (!sess) {
      return jsonNoStore(
        { error: "Sessão não encontrada." },
        { status: 404 }
      );
    }

    // checa expiração real
    const expired = isExpiredWithGrace(sess.expires_at);

    if (expired && sess.status === "pending_face") {
      // se expirou antes da captura -> marca como expired e recusa
      await db.query(
        `
          UPDATE wzb_tokens
          SET status = 'expired'
          WHERE id = ?
        `,
        [sess.token_id]
      );

      return jsonNoStore(
        { error: "Sessão expirada, gere outro QR." },
        { status: 400 }
      );
    }

    if (sess.status !== "pending_face") {
      return jsonNoStore(
        { error: "Sessão já utilizada / bloqueada." },
        { status: 400 }
      );
    }

    // salva a imagem no banco
    await db.query(
      `
        UPDATE pending_validations
        SET selfie_b64 = ?, updated_at = NOW()
        WHERE token_id = ?
      `,
      [selfieDataUrl, sess.token_id]
    );

    // atualiza a sessão pra face_captured
    await db.query(
      `
        UPDATE wzb_tokens
        SET status = 'face_captured',
            used_at = NOW()
        WHERE id = ?
      `,
      [sess.token_id]
    );

    // pega o estado atualizado pra retornar consistente
    sess = await fetchSessionRowById(sess.token_id);

    return jsonNoStore({
      success: true,
      message: "Selfie recebida com sucesso.",
      status: "face_captured",
      selfiePreview: sess?.selfie_b64 || selfieDataUrl,
    });
  } catch (err: any) {
    console.error("[QRFACE PUT ERROR]", err);
    return jsonNoStore(
      { error: err.message || "Erro interno" },
      { status: 500 }
    );
  }
}

/* =========================================================================
   GET /api/qrface?session=...
   Usado pelo DASHBOARD (polling) e pelo CELULAR pra validar no começo.
   Fluxo:
   - decodifica ticket -> sid
   - lê sessão no banco
   - se expirou e ainda tá pending_face => reporta "expired"
   - senão reporta status real (pending_face | face_captured | expired ...)
   - SEM CACHE
 ========================================================================= */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionTicket = searchParams.get("session");

    if (!sessionTicket) {
      return jsonNoStore(
        { error: "session é obrigatório." },
        { status: 400 }
      );
    }

    const decoded = verifyFaceSessionTicket(sessionTicket);
    if (!decoded) {
      return jsonNoStore(
        { error: "Sessão inválida ou expirada." },
        { status: 400 }
      );
    }

    const sess = await fetchSessionRowById(decoded.sid);
    if (!sess) {
      return jsonNoStore(
        { error: "Sessão não encontrada." },
        { status: 404 }
      );
    }

    const expiredNow = isExpiredWithGrace(sess.expires_at);

    // "expired" só é forçado se ainda estava pendente e passou do tempo
    const effectiveStatus =
      expiredNow && sess.status === "pending_face"
        ? "expired"
        : sess.status;

    return jsonNoStore({
      success: true,
      status: effectiveStatus, // pending_face | face_captured | expired | etc.
      selfie_b64: sess.selfie_b64 || null,
    });
  } catch (err: any) {
    console.error("[QRFACE GET ERROR]", err);
    return jsonNoStore(
      { error: err.message || "Erro interno" },
      { status: 500 }
    );
  }
}
