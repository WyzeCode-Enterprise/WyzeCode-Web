// app/api/envite-docs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import jwt from "jsonwebtoken";

/** Opcional: se você quiser forçar dinâmico */
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------
   Helpers: sessão de login (cookie wzb_lg) e validações
------------------------------------------------------------------- */
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

function getSessionCookie(req: NextRequest): string | null {
  const cookieHeader = req.headers.get("cookie") || "";
  const found = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("wzb_lg="));
  if (!found) return null;
  return found.replace("wzb_lg=", "");
}

function getSessionInfoFromCookie(
  req: NextRequest
): { uid: number | null; sid: string | null } {
  const raw = getSessionCookie(req);
  if (!raw) return { uid: null, sid: null };
  try {
    const decoded: any = jwt.verify(raw, JWT_SECRET);
    if (!decoded || !decoded.uid || !decoded.sid) {
      return { uid: null, sid: null };
    }
    return { uid: decoded.uid, sid: decoded.sid };
  } catch {
    return { uid: null, sid: null };
  }
}

function isDataUrlOk(dataUrl: string, allowPdf = false, maxBytes = 12_000_000) {
  // aceita image/* e, opcionalmente, application/pdf
  if (typeof dataUrl !== "string") return false;
  const okMime =
    dataUrl.startsWith("data:image/") ||
    (allowPdf && dataUrl.startsWith("data:application/pdf"));
  if (!okMime) return false;

  // limite "aprox." (chars ~ bytes para Base64URL/DataURL é maior, mas atende a 10MB)
  if (dataUrl.length > maxBytes * 1.37) return false;

  return true;
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

/* ------------------------------------------------------------------
   DB helpers
------------------------------------------------------------------- */

async function fetchFaceSessionByLoginSid(loginSid: string) {
  const [rows] = await db.query(
    `
      SELECT
        fs.id                 AS face_session_id,
        fs.session_sid        AS login_sid,
        fs.user_id            AS user_id,
        fs.internal_token     AS internal_token,
        fs.w_code             AS w_code,
        fs.status             AS status
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

/* =========================================================================
   POST /api/envite-docs
   Recebe: front_b64, back_b64, selfie_b64, user{ name,email,cpfOrCnpj,phone,id }
   Requer cookie wzb_lg para obter session_sid; resolve internal_token/w_code.
   Insere em wzb_pending_docs com status 'in_review'.
 ========================================================================= */
export async function POST(req: NextRequest) {
  try {
    const { uid, sid } = getSessionInfoFromCookie(req);
    if (!uid || !sid) {
      return json({ error: "Usuário não autenticado." }, 401);
    }

    const payload = await req.json();
    const front_b64: string | undefined = payload?.front_b64;
    const back_b64: string | undefined = payload?.back_b64;
    const selfie_b64: string | undefined = payload?.selfie_b64;
    const user = payload?.user || {};
    const name = String(user?.name || "").trim() || null;
    const email = String(user?.email || "").trim() || null;
    const cpfOrCnpj = String(user?.cpfOrCnpj || "").trim() || null;
    const phone = String(user?.phone || "").trim() || null;
    const user_id = Number.isFinite(user?.id) ? Number(user?.id) : uid;

    // validações: frente, verso e selfie obrigatórios
    if (!front_b64 || !back_b64 || !selfie_b64) {
      return json(
        { error: "Frente, verso e selfie são obrigatórios." },
        400
      );
    }

    // valida formato/tamanho (image/* ou pdf para frente/verso; image/* para selfie)
    const okFront = isDataUrlOk(front_b64, true /* allow PDF */);
    const okBack = isDataUrlOk(back_b64, true /* allow PDF */);
    const okSelfie = isDataUrlOk(selfie_b64, false /* no PDF */);

    if (!okFront || !okBack || !okSelfie) {
      return json(
        { error: "Arquivos inválidos ou muito grandes (até ~10MB cada)." },
        400
      );
    }

    // carrega infos da face_session atual pelo session_sid
    const face = await fetchFaceSessionByLoginSid(sid);
    if (!face) {
      return json(
        { error: "Sessão facial não encontrada para este login." },
        404
      );
    }

    // insere em wzb_pending_docs
    // Ajuste os nomes de colunas conforme seu schema real.
    const [insertRes] = await db.query(
      `
        INSERT INTO wzb_pending_docs (
          user_id,
          name,
          email,
          cpf_or_cnpj,
          phone,
          session_sid,
          internal_token,
          w_code,
          doc_front_b64,
          doc_back_b64,
          selfie_b64,
          status,
          created_at,
          updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_review', NOW(), NOW()
        )
      `,
      [
        user_id,
        name,
        email,
        cpfOrCnpj,
        phone,
        face.login_sid,
        face.internal_token,
        face.w_code,
        front_b64,
        back_b64,
        selfie_b64,
      ]
    );

    // opcional: você pode mudar status da face_sessions para 'pending_review'
    // await db.query(
    //   `UPDATE face_sessions SET status = 'pending_review' WHERE id = ?`,
    //   [face.face_session_id]
    // );

    return json({
      success: true,
      pending_id: (insertRes as any)?.insertId ?? null,
      session_sid: face.login_sid,
      internal_token: face.internal_token,
      w_code: face.w_code,
    });
  } catch (err: any) {
    console.error("[ENVITE-DOCS POST ERROR]", err);
    return json({ error: err?.message || "Erro interno" }, 500);
  }
}
