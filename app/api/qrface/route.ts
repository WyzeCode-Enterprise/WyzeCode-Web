import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import crypto from "crypto";
import jwt from "jsonwebtoken";

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

/* ------------------------------------------------------------------
   Utils
------------------------------------------------------------------- */

function generateInternalToken() {
  // blob randômico comprido pra auditoria interna
  return crypto.randomBytes(150).toString("base64url");
}

function generateWCode() {
  // código humano curto tipo 493210
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Lê cookie wzb_lg com o JWT da sessão web
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
 * Decodifica o JWT de login e retorna:
 *  - uid: user_id
 *  - sid: id único dessa sessão de login (salvo no banco de logins)
 */
function getSessionInfoFromCookie(
  req: NextRequest
): { uid: number | null; sid: string | null } {
  const raw = getSessionCookie(req);
  if (!raw) return { uid: null, sid: null };
  try {
    const decoded: any = jwt.verify(
      raw,
      process.env.JWT_SECRET || "supersecretkey"
    );
    if (!decoded || !decoded.uid || !decoded.sid) {
      return { uid: null, sid: null };
    }
    return { uid: decoded.uid, sid: decoded.sid };
  } catch (err) {
    console.error("[qrface] JWT inválido:", err);
    return { uid: null, sid: null };
  }
}

/**
 * Cria o ticket curto que VAI NO QR (usado no celular).
 * payload: { sid: <face_sessions.id> }
 */
function signFaceSessionTicket(faceSessionRowId: number) {
  const payload = { sid: faceSessionRowId };
  const expiresInSec = TOKEN_LIFETIME_MIN * 60 + EXPIRE_GRACE_SECONDS;
  return jwt.sign(payload, FACE_SESSION_SECRET, { expiresIn: expiresInSec });
}

/**
 * Valida ticket curto vindo do celular / dashboard
 */
function verifyFaceSessionTicket(ticket: string | null): { sid: number } | null {
  if (!ticket) return null;
  try {
    const decoded = jwt.verify(ticket, FACE_SESSION_SECRET) as any;
    if (!decoded || typeof decoded.sid !== "number") return null;
    return { sid: decoded.sid };
  } catch (err) {
    console.warn("[qrface] ticket inválido/expirado:", err);
    return null;
  }
}

/**
 * Check básico da selfie base64
 */
function isLikelySafeDataUrl(img: string): boolean {
  if (typeof img !== "string") return false;
  if (!img.startsWith("data:image/")) return false;
  if (img.length > 2_600_000) return false; // ~2.6MB
  return true;
}

/**
 * considera expirado se já passou do expires_at
 * + tolerância EXPIRE_GRACE_SECONDS
 */
function isExpiredWithGrace(expires_at: any): boolean {
  if (!expires_at) return false;
  const expMs = new Date(expires_at).getTime();
  const nowMs = Date.now();
  return expMs + EXPIRE_GRACE_SECONDS * 1000 < nowMs;
}

/**
 * segundos que faltam até expirar (>=0)
 */
function secondsUntilExpiry(expires_at: any): number {
  if (!expires_at) return 0;
  const expMs = new Date(expires_at).getTime();
  const nowMs = Date.now();
  const diff = Math.floor((expMs - nowMs) / 1000);
  return diff > 0 ? diff : 0;
}

/* ------------------------------------------------------------------
   DB helpers
------------------------------------------------------------------- */

/**
 * Cria linha filha em face_session_data se não existir ainda
 */
async function ensureFaceSessionDataRow(faceSessionId: number) {
  const [rows] = await db.query(
    `
      SELECT face_session_id
      FROM face_session_data
      WHERE face_session_id = ?
      LIMIT 1
    `,
    [faceSessionId]
  );

  const found = (rows as any[])[0];
  if (!found) {
    await db.query(
      `
        INSERT INTO face_session_data (
          face_session_id,
          selfie_b64,
          created_at,
          updated_at
        )
        VALUES (?, NULL, NOW(), NOW())
      `,
      [faceSessionId]
    );
  }
}

/**
 * Busca sessão facial pelo ID primário (face_sessions.id)
 */
async function fetchFaceSessionById(faceSessionId: number) {
  const [rows] = await db.query(
    `
      SELECT
        fs.id                 AS face_session_id,
        fs.session_sid        AS login_sid,
        fs.user_id            AS user_id,
        fs.status             AS face_status,
        fs.expires_at         AS expires_at,
        fs.used_at            AS used_at,
        fs.created_at         AS created_at,
        fs.w_code             AS w_code,
        fs.internal_token     AS internal_token,
        fsd.selfie_b64        AS selfie_b64
      FROM face_sessions fs
      LEFT JOIN face_session_data fsd
        ON fsd.face_session_id = fs.id
      WHERE fs.id = ?
      LIMIT 1
    `,
    [faceSessionId]
  );

  const row = (rows as any[])[0];
  if (!row) return null;

  return {
    face_session_id: row.face_session_id,
    login_sid: row.login_sid,
    user_id: row.user_id,
    status: row.face_status,
    expires_at: row.expires_at,
    used_at: row.used_at,
    created_at: row.created_at,
    w_code: row.w_code,
    internal_token: row.internal_token,
    selfie_b64: row.selfie_b64 || null,
  };
}

/**
 * Busca sessão facial atual por session_sid do login (UNIQUE)
 */
async function fetchFaceSessionByLoginSid(loginSid: string) {
  const [rows] = await db.query(
    `
      SELECT
        fs.id                 AS face_session_id,
        fs.session_sid        AS login_sid,
        fs.user_id            AS user_id,
        fs.status             AS face_status,
        fs.expires_at         AS expires_at,
        fs.used_at            AS used_at,
        fs.created_at         AS created_at,
        fs.w_code             AS w_code,
        fs.internal_token     AS internal_token,
        fsd.selfie_b64        AS selfie_b64
      FROM face_sessions fs
      LEFT JOIN face_session_data fsd
        ON fsd.face_session_id = fs.id
      WHERE fs.session_sid = ?
      LIMIT 1
    `,
    [loginSid]
  );

  const row = (rows as any[])[0];
  if (!row) return null;

  return {
    face_session_id: row.face_session_id,
    login_sid: row.login_sid,
    user_id: row.user_id,
    status: row.face_status,
    expires_at: row.expires_at,
    used_at: row.used_at,
    created_at: row.created_at,
    w_code: row.w_code,
    internal_token: row.internal_token,
    selfie_b64: row.selfie_b64 || null,
  };
}

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
   - pega uid/sid de quem está logado (cookie JWT "wzb_lg")
   - tenta achar face_sessions pra esse session_sid
   - se expirou e ainda tava "pending_face", recicla a MESMA linha
   - se já tem selfie, mantém "face_captured"
   - se não existe linha, cria nova

   Retorna SEMPRE um objeto com:
   {
     success: true,
     session: "<ticket curto>",          // vai no QR / celular
     url: "https://.../qrface?session=...", // link completo p/ celular
     selfie_b64: "...ou null...",
     status: "pending_face" | "face_captured" | "expired" | ...,
     expires_in_sec: number
   }
 ========================================================================= */
export async function POST(req: NextRequest) {
  try {
    const { uid, sid } = getSessionInfoFromCookie(req);
    if (!uid || !sid) {
      return jsonNoStore(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    // 1) tentar achar sessão facial existente pra esse session_sid
    let sess = await fetchFaceSessionByLoginSid(sid);

    if (sess) {
      const expired = isExpiredWithGrace(sess.expires_at);

      // se expirou e ainda tava pendente (ninguém tirou selfie),
      // reciclamos a mesma linha
      if (expired && sess.status === "pending_face") {
        const newInternalToken = generateInternalToken();
        const newWCode = generateWCode();

        await db.query(
          `
            UPDATE face_sessions
            SET internal_token = ?,
                w_code = ?,
                status = 'pending_face',
                used_at = NULL,
                expires_at = DATE_ADD(NOW(), INTERVAL ${TOKEN_LIFETIME_MIN} MINUTE)
            WHERE id = ?
          `,
          [newInternalToken, newWCode, sess.face_session_id]
        );

        await db.query(
          `
            UPDATE face_session_data
            SET selfie_b64 = NULL,
                updated_at = NOW()
            WHERE face_session_id = ?
          `,
          [sess.face_session_id]
        );

        // refetch pra ter os campos atualizados
        const refreshed = await fetchFaceSessionById(sess.face_session_id);
        if (!refreshed) {
          // não era pra acontecer, mas vamos falhar de forma controlada
          return jsonNoStore(
            { error: "Falha ao renovar sessão facial." },
            { status: 500 }
          );
        }
        sess = refreshed;
      }

      // garante linha filha (por segurança em bases antigas)
      await ensureFaceSessionDataRow(sess.face_session_id);

      // gera o ticket curto pro celular
      const sessionTicket = signFaceSessionTicket(sess.face_session_id);

      return jsonNoStore({
        success: true,
        session: sessionTicket,
        url: `https://wyzebank.com/qrface?session=${encodeURIComponent(
          sessionTicket
        )}`,
        selfie_b64: sess.selfie_b64 || null,
        status: sess.status || "pending_face",
        expires_in_sec: secondsUntilExpiry(sess.expires_at),
      });
    }

    // 2) não tinha sessão facial ainda → criar agora
    const internalToken = generateInternalToken();
    const wCode = generateWCode();

    const insertRes: any = await db.query(
      `
        INSERT INTO face_sessions (
          session_sid,
          user_id,
          internal_token,
          w_code,
          status,
          created_at,
          used_at,
          expires_at
        )
        VALUES (
          ?,          -- sid do login (UNIQUE por sessão do dashboard)
          ?,          -- user_id dono
          ?,          -- token interno aleatório
          ?,          -- código humano curto
          'pending_face',
          NOW(),
          NULL,
          DATE_ADD(NOW(), INTERVAL ${TOKEN_LIFETIME_MIN} MINUTE)
        )
      `,
      [sid, uid, internalToken, wCode]
    );

    const insertedInfo = Array.isArray(insertRes) ? insertRes[0] : insertRes;
    const newFaceSessionId = insertedInfo.insertId as number;

    // cria linha filha vazia
    await db.query(
      `
        INSERT INTO face_session_data (
          face_session_id,
          selfie_b64,
          created_at,
          updated_at
        )
        VALUES (?, NULL, NOW(), NOW())
      `,
      [newFaceSessionId]
    );

    const freshSess = await fetchFaceSessionById(newFaceSessionId);
    if (!freshSess) {
      return jsonNoStore(
        { error: "Falha ao criar sessão facial." },
        { status: 500 }
      );
    }

    const sessionTicket = signFaceSessionTicket(newFaceSessionId);

    return jsonNoStore({
      success: true,
      session: sessionTicket,
      url: `https://wyzebank.com/qrface?session=${encodeURIComponent(
        sessionTicket
      )}`,
      selfie_b64: null,
      status: "pending_face",
      expires_in_sec: secondsUntilExpiry(freshSess.expires_at),
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
   Chamado PELO CELULAR quando a pessoa captura a selfie.
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

    let sess = await fetchFaceSessionById(decoded.sid);
    if (!sess) {
      return jsonNoStore(
        { error: "Sessão não encontrada." },
        { status: 404 }
      );
    }

    const expired = isExpiredWithGrace(sess.expires_at);

    // expirou antes de capturar
    if (expired && sess.status === "pending_face") {
      await db.query(
        `
          UPDATE face_sessions
          SET status = 'expired'
          WHERE id = ?
        `,
        [sess.face_session_id]
      );

      return jsonNoStore(
        { error: "Sessão expirada, gere outro QR." },
        { status: 400 }
      );
    }

    // se já não está mais pending_face, bloqueia reuso
    if (sess.status !== "pending_face") {
      return jsonNoStore(
        { error: "Sessão já utilizada / bloqueada." },
        { status: 400 }
      );
    }

    // salva selfie
    await db.query(
      `
        UPDATE face_session_data
        SET selfie_b64 = ?, updated_at = NOW()
        WHERE face_session_id = ?
      `,
      [selfieDataUrl, sess.face_session_id]
    );

    // marca como capturada / usada
    await db.query(
      `
        UPDATE face_sessions
        SET status = 'face_captured',
            used_at = NOW()
        WHERE id = ?
      `,
      [sess.face_session_id]
    );

    // refetch pra devolver a versão final
    const finalSess = await fetchFaceSessionById(sess.face_session_id);

    return jsonNoStore({
      success: true,
      message: "Selfie recebida com sucesso.",
      status: "face_captured",
      selfiePreview: finalSess?.selfie_b64 || selfieDataUrl,
      expires_in_sec: secondsUntilExpiry(finalSess?.expires_at),
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
   Chamado:
   - pelo dashboard (polling) pra ver se já chegou selfie
   - pelo celular logo que abre o link do QR
 ========================================================================= */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ticketFromUrl = searchParams.get("session");

    if (!ticketFromUrl) {
      return jsonNoStore(
        { error: "session é obrigatório." },
        { status: 400 }
      );
    }

    const decoded = verifyFaceSessionTicket(ticketFromUrl);
    if (!decoded) {
      return jsonNoStore(
        { error: "Sessão inválida ou expirada." },
        { status: 400 }
      );
    }

    const sess = await fetchFaceSessionById(decoded.sid);
    if (!sess) {
      return jsonNoStore(
        { error: "Sessão não encontrada." },
        { status: 404 }
      );
    }

    const expiredNow = isExpiredWithGrace(sess.expires_at);

    const effectiveStatus =
      expiredNow && sess.status === "pending_face"
        ? "expired"
        : sess.status;

    return jsonNoStore({
      success: true,
      status: effectiveStatus, // pending_face | face_captured | expired | etc.
      selfie_b64: sess.selfie_b64 || null,
      expires_in_sec: secondsUntilExpiry(sess.expires_at),
    });
  } catch (err: any) {
    console.error("[QRFACE GET ERROR]", err);
    return jsonNoStore(
      { error: err.message || "Erro interno" },
      { status: 500 }
    );
  }
}
