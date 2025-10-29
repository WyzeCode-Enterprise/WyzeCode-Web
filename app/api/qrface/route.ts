// /app/api/qrface/route.ts
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
   Helpers utilitários
------------------------------------------------------------------- */

/**
 * Gera blob randômico grandão pra auditoria interna.
 * Não vai dentro do QR diretamente.
 */
function generateInternalToken() {
  return crypto.randomBytes(150).toString("base64url");
}

/**
 * Código humano curto de suporte/suporte manual
 * Ex: 493210
 */
function generateWCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Extrai o cookie wzb_lg cru do request
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
 * Decodifica o JWT de sessão (o MESMO do login),
 * e retorna { uid, sid }.
 *
 * - uid = user.id
 * - sid = identificador único daquela sessão de login (uuid v4 que vc grava em logins.cookie_session)
 *
 * Se não conseguir validar, retorna { uid: null, sid: null }
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
 * Cria ticket curto assinado (vai dentro da URL do QR).
 * Esse ticket TEM que ser curto e só contém { sid: <face_session_row_id> }
 * OBS: NÃO confundir isso com o sid da sessão de login.
 *
 * expiresInSec ~ 5 minutos + tolerância de 2s.
 */
function signFaceSessionTicket(faceSessionRowId: number) {
  const payload = { sid: faceSessionRowId };
  const expiresInSec = TOKEN_LIFETIME_MIN * 60 + EXPIRE_GRACE_SECONDS;
  return jwt.sign(payload, FACE_SESSION_SECRET, { expiresIn: expiresInSec });
}

/**
 * Valida/decodifica o ticket curto.
 * Retorna { sid: <face_session_row_id> } ou null.
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
    console.warn("[qrface] ticket inválido/expirado:", err);
    return null;
  }
}

/**
 * Sanity check pra imagem base64
 */
function isLikelySafeDataUrl(img: string): boolean {
  if (typeof img !== "string") return false;
  if (!img.startsWith("data:image/")) return false;
  if (img.length > 2_600_000) return false; // ~2.6MB base64
  return true;
}

/**
 * Checa se expirou MESMO considerando uma pequena folga
 */
function isExpiredWithGrace(expires_at: any): boolean {
  if (!expires_at) return false;
  const expMs = new Date(expires_at).getTime();
  const nowMs = Date.now();
  return expMs + EXPIRE_GRACE_SECONDS * 1000 < nowMs;
}

/**
 * Segura: quanto tempo (em segundos) resta até expirar.
 * Nunca retorna negativo. Se já passou, volta 0.
 */
function secondsUntilExpiry(expires_at: any): number {
  if (!expires_at) return 0;
  const expMs = new Date(expires_at).getTime();
  const nowMs = Date.now();
  const diff = Math.floor((expMs - nowMs) / 1000);
  return diff > 0 ? diff : 0;
}

/**
 * Lê sessão facial pelo ID de linha (PK face_sessions.id)
 */
async function fetchFaceSessionById(faceSessionId: number) {
  const [rows] = await db.query(
    `
      SELECT
        fs.id                    AS face_session_id,
        fs.session_sid           AS login_sid,
        fs.user_id               AS user_id,
        fs.status                AS face_status,
        fs.expires_at            AS expires_at,
        fs.used_at               AS used_at,
        fs.created_at            AS created_at,
        fs.w_code                AS w_code,
        fs.internal_token        AS internal_token,
        fsd.selfie_b64           AS selfie_b64
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
 * Lê sessão facial atual usando o sid de login (session_sid UNIQUE)
 * Se não tiver, retorna null.
 */
async function fetchFaceSessionByLoginSid(loginSid: string) {
  const [rows] = await db.query(
    `
      SELECT
        fs.id                    AS face_session_id,
        fs.session_sid           AS login_sid,
        fs.user_id               AS user_id,
        fs.status                AS face_status,
        fs.expires_at            AS expires_at,
        fs.used_at               AS used_at,
        fs.created_at            AS created_at,
        fs.w_code                AS w_code,
        fs.internal_token        AS internal_token,
        fsd.selfie_b64           AS selfie_b64
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

/**
 * Helper padrão pra JSON SEM CACHE
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

   O que faz:
   - pega uid/sid do JWT que já está em wzb_lg
   - tenta reaproveitar a sessão facial desse MESMO sid (UNIQUE)
   - se está expirada e ainda não tem selfie -> "recicla" a mesma linha
     (status volta pra pending_face, selfie reseta, renova expires_at)
   - se já tem selfie (face_captured) mantém assim
   - se não existir linha, cria agora

   Retorna:
   {
     success: true,
     session: "<ticket curto assinado>",
     url: "https://wyzebank.com/qrface?session=...",
     selfie_b64: "...ou null...",
     status: "pending_face" | "face_captured" | ...,
     expires_in_sec: 123
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

    // 1) tenta achar sessão facial pra esse sid (login atual)
    let sess = await fetchFaceSessionByLoginSid(sid);

    // 2) Se já existe uma linha pra esse sid:
    if (sess) {
      const expired = isExpiredWithGrace(sess.expires_at);

      // caso esteja expirada E AINDA está pendente (ninguém tirou selfie):
      if (expired && sess.status === "pending_face") {
        const newInternalToken = generateInternalToken();
        const newWCode = generateWCode();

        // "recicla" a MESMA linha em vez de criar outra
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

        // zera selfie naquela mesma linha
        await db.query(
          `
            UPDATE face_session_data
            SET selfie_b64 = NULL,
                updated_at = NOW()
            WHERE face_session_id = ?
          `,
          [sess.face_session_id]
        );

        sess = await fetchFaceSessionById(sess.face_session_id);
      }

      // agora temos "sess" já consistente
      const sessionTicket = signFaceSessionTicket(sess!.face_session_id);

      return jsonNoStore({
        success: true,
        session: sessionTicket,
        url: `https://wyzebank.com/qrface?session=${encodeURIComponent(
          sessionTicket
        )}`,
        selfie_b64: sess?.selfie_b64 || null,
        status: sess?.status || "pending_face",
        expires_in_sec: secondsUntilExpiry(sess?.expires_at),
      });
    }

    // 3) Não existe linha ainda pra esse sid → cria do zero
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
          ?,          -- sid do login (único)
          ?,          -- user_id dono
          ?,          -- token interno
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

    // cria face_session_data correspondente, ainda sem selfie
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

    // pega sessão montada
    const freshSess = await fetchFaceSessionById(newFaceSessionId);
    const sessionTicket = signFaceSessionTicket(newFaceSessionId);

    return jsonNoStore({
      success: true,
      session: sessionTicket,
      url: `https://wyzebank.com/qrface?session=${encodeURIComponent(
        sessionTicket
      )}`,
      selfie_b64: null,
      status: "pending_face",
      expires_in_sec: secondsUntilExpiry(freshSess?.expires_at),
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
   Chamado PELO CELULAR depois que a pessoa tirou a foto.

   Body esperado:
   {
     session: "<ticket curto recebido no QR>",
     selfieDataUrl: "data:image/jpeg;base64,..."
   }

   Fluxo:
   - decodifica ticket curto -> face_session_id
   - busca linha face_sessions
   - se expirou e ainda era pending_face, marca como 'expired' e recusa
   - se status !== 'pending_face', recusa (já usada / bloqueada)
   - salva selfie em face_session_data.selfie_b64
   - atualiza face_sessions.status='face_captured', used_at=NOW()
   - retorna preview

   Esse PUT é justamente o gatilho que faz o dashboard parar
   de mostrar o QR e passar a mostrar a selfie (via polling que você já faz).
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

    // expirou e ainda não tinha sido usada?
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

    // se já não está mais pending_face, não deixa sobrescrever
    if (sess.status !== "pending_face") {
      return jsonNoStore(
        { error: "Sessão já utilizada / bloqueada." },
        { status: 400 }
      );
    }

    // salva selfie e marca como capturada
    await db.query(
      `
        UPDATE face_session_data
        SET selfie_b64 = ?, updated_at = NOW()
        WHERE face_session_id = ?
      `,
      [selfieDataUrl, sess.face_session_id]
    );

    await db.query(
      `
        UPDATE face_sessions
        SET status = 'face_captured',
            used_at = NOW()
        WHERE id = ?
      `,
      [sess.face_session_id]
    );

    // refetch pra devolver payload consistente
    sess = await fetchFaceSessionById(sess.face_session_id);

    return jsonNoStore({
      success: true,
      message: "Selfie recebida com sucesso.",
      status: "face_captured",
      selfiePreview: sess?.selfie_b64 || selfieDataUrl,
      expires_in_sec: secondsUntilExpiry(sess?.expires_at),
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
   Usado de dois jeitos:
   - DASHBOARD (polling a cada ~2.5s) pra ver se a selfie chegou
   - CELULAR (logo ao abrir o link do QR) pra validar se ainda tá viva

   Fluxo:
   - decodifica ticket curto -> face_session_id
   - busca linha
   - se expirou e status ainda era pending_face => "expired"
   - devolve status e selfie_b64 (se já tem)
   - devolve expires_in_sec também
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

    // se já passou o tempo e ainda tava pendente => "expired"
    const effectiveStatus =
      expiredNow && sess.status === "pending_face"
        ? "expired"
        : sess.status;

    return jsonNoStore({
      success: true,
      status: effectiveStatus,           // pending_face | face_captured | expired | ...
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
