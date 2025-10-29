// app/api/envite-docs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import jwt from "jsonwebtoken";

export const dynamic = "force-dynamic";

/** ===================== Sessão / Segurança ===================== */
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

/** Limites (bytes) para evitar max_allowed_packet e abusos */
const PER_FILE_LIMIT = 6 * 1024 * 1024;      // 6 MB por arquivo (real aproximado)
const COMBINED_LIMIT  = 14 * 1024 * 1024;    // 14 MB total (frente+verso+selfie)

/** ===================== Helpers base ===================== */
function getSessionCookie(req: NextRequest): string | null {
  const cookieHeader = req.headers.get("cookie") || "";
  const found = cookieHeader.split(";").map(c => c.trim()).find(c => c.startsWith("wzb_lg="));
  if (!found) return null;
  return found.replace("wzb_lg=", "");
}

function getSessionInfoFromCookie(req: NextRequest): { uid: number | null; sid: string | null } {
  const raw = getSessionCookie(req);
  if (!raw) return { uid: null, sid: null };
  try {
    const decoded: any = jwt.verify(raw, JWT_SECRET);
    if (!decoded?.uid || !decoded?.sid) return { uid: null, sid: null };
    return { uid: decoded.uid, sid: decoded.sid };
  } catch {
    return { uid: null, sid: null };
  }
}

function json(body: any, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

/** ===================== Util: DataURL -> bytes aproximados ===================== */
function approxBinaryBytesFromDataURL(dataUrl: string): number {
  if (typeof dataUrl !== "string") return 0;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const b64 = dataUrl.slice(comma + 1).replace(/\s/g, "");
  const len = b64.length;
  let padding = 0;
  if (b64.endsWith("==")) padding = 2;
  else if (b64.endsWith("=")) padding = 1;
  return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

function isAllowedMime(dataUrl: string, allowPdf = false): boolean {
  if (!dataUrl.startsWith("data:")) return false;
  if (dataUrl.startsWith("data:image/")) return true;
  if (allowPdf && dataUrl.startsWith("data:application/pdf")) return true;
  return false;
}

/** ===================== DB Helpers ===================== */
async function fetchFaceSessionByLoginSid(loginSid: string) {
  const [rows] = await db.query(
    `
      SELECT
        fs.id           AS face_session_id,
        fs.session_sid  AS login_sid,
        fs.user_id      AS user_id,
        fs.internal_token,
        fs.w_code,
        fs.status
      FROM face_sessions fs
      WHERE fs.session_sid = ?
      LIMIT 1
    `,
    [loginSid]
  );
  const row = (rows as any[])[0];
  if (!row) return null;
  return {
    face_session_id: row.face_session_id as number,
    login_sid: row.login_sid as string,
    user_id: row.user_id as number,
    internal_token: row.internal_token as string,
    w_code: row.w_code as string,
    status: row.status as string,
  };
}

/** Retorna o último registro e um flag "locked" (in_review/approved) */
async function getLastPendingByUser(userId: number) {
  const [rows] = await db.query(
    `
      SELECT id, status, created_at, updated_at
      FROM wzb_pending_docs
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 1
    `,
    [userId]
  );
  const last = (rows as any[])[0] || null;
  const status = last?.status || null;
  const locked = status === "in_review" || status === "approved";
  return { last, status, locked };
}

/** ===================== GET /api/envite-docs =====================
 * Verifica se o usuário já possui envio "em validação" ou aprovado.
 * Usado no F5 para travar o botão do alerta e mostrar confirmação inline.
 * ================================================================= */
export async function GET(req: NextRequest) {
  try {
    const { uid } = getSessionInfoFromCookie(req);
    if (!uid) return json({ error: "Usuário não autenticado." }, 401);

    const { last, status, locked } = await getLastPendingByUser(uid);

    return json({
      success: true,
      locked,
      last_status: status,
      pending_id: last?.id || null,
    });
  } catch (err: any) {
    console.error("[ENVITE-DOCS GET ERROR]", err);
    return json({ error: err?.message || "Erro interno" }, 500);
  }
}

/** ===================== POST /api/envite-docs ==================== */
export async function POST(req: NextRequest) {
  try {
    const { uid, sid } = getSessionInfoFromCookie(req);
    if (!uid || !sid) return json({ error: "Usuário não autenticado." }, 401);

    // Se já tem in_review/approved, não deixa reenviar
    const already = await getLastPendingByUser(uid);
    if (already.locked) {
      return json(
        {
          error: "Já existe um envio em análise/aprovado para este usuário.",
          code: "ALREADY_IN_REVIEW",
          locked: true,
          pending_id: already.last?.id || null,
          last_status: already.status,
        },
        409
      );
    }

    const payload = await req.json();
    const front_b64: string | undefined = payload?.front_b64;
    const back_b64: string | undefined = payload?.back_b64;
    const selfie_b64: string | undefined = payload?.selfie_b64;

    const user = payload?.user || {};
    const name = (String(user?.name || "").trim() || null) as string | null;
    const email = (String(user?.email || "").trim() || null) as string | null;
    const cpfOrCnpj = (String(user?.cpfOrCnpj || "").trim() || null) as string | null;
    const phone = (String(user?.phone || "").trim() || null) as string | null;
    const user_id = Number.isFinite(user?.id) ? Number(user?.id) : uid;

    // Presença obrigatória
    if (!front_b64 || !back_b64 || !selfie_b64) {
      return json({ error: "Frente, verso e selfie são obrigatórios." }, 400);
    }

    // MIME permitido
    if (!isAllowedMime(front_b64, true) || !isAllowedMime(back_b64, true) || !isAllowedMime(selfie_b64, false)) {
      return json({ error: "Formato inválido. Use image/* (selfie) e image/* ou PDF (frente/verso)." }, 400);
    }

    // Tamanho real aproximado
    const frontBytes  = approxBinaryBytesFromDataURL(front_b64);
    const backBytes   = approxBinaryBytesFromDataURL(back_b64);
    const selfieBytes = approxBinaryBytesFromDataURL(selfie_b64);

    if (frontBytes === 0 || backBytes === 0 || selfieBytes === 0) {
      return json({ error: "Arquivos inválidos (data URL malformado)." }, 400);
    }

    // Limites
    if (frontBytes > PER_FILE_LIMIT || backBytes > PER_FILE_LIMIT || selfieBytes > PER_FILE_LIMIT) {
      return json(
        { error: `Cada arquivo deve ter até ~${Math.floor(PER_FILE_LIMIT / (1024 * 1024))}MB (tamanho real).` },
        413
      );
    }
    const combined = frontBytes + backBytes + selfieBytes;
    if (combined > COMBINED_LIMIT) {
      return json(
        { error: `O total dos arquivos excede ~${Math.floor(COMBINED_LIMIT / (1024 * 1024))}MB. Reduza as imagens.` },
        413
      );
    }

    // Face session para pegar session_sid/internal_token/w_code
    const face = await fetchFaceSessionByLoginSid(sid);
    if (!face) return json({ error: "Sessão facial não encontrada para este login." }, 404);

    // Insert
    try {
      const [insertRes] = await db.query(
        `
          INSERT INTO wzb_pending_docs (
            user_id, name, email, cpf_or_cnpj, phone,
            session_sid, internal_token, w_code,
            doc_front_b64, doc_back_b64, selfie_b64,
            status, created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            'in_review', NOW(), NOW()
          )
        `,
        [
          user_id, name, email, cpfOrCnpj, phone,
          face.login_sid, face.internal_token, face.w_code,
          front_b64, back_b64, selfie_b64
        ]
      );

      return json({
        success: true,
        pending_id: (insertRes as any)?.insertId ?? null,
        session_sid: face.login_sid,
        internal_token: face.internal_token,
        w_code: face.w_code,
        locked: true,
        last_status: "in_review",
      });
    } catch (dbErr: any) {
      const msg = String(dbErr?.message || "");
      const code = String(dbErr?.code || "");
      if (msg.includes("max_allowed_packet") || code === "ER_NET_PACKET_TOO_LARGE") {
        return json(
          {
            error:
              "O servidor recusou o tamanho do pacote (max_allowed_packet). Reduza as imagens ou aumente o limite no MySQL para 64M/128M.",
            hint:
              "MySQL: SET GLOBAL max_allowed_packet=67108864; e em [mysqld] max_allowed_packet=64M.",
          },
          413
        );
      }
      throw dbErr;
    }
  } catch (err: any) {
    console.error("[ENVITE-DOCS POST ERROR]", err);
    return json({ error: err?.message || "Erro interno" }, 500);
  }
}
