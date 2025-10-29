import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import crypto from "crypto";
import jwt from "jsonwebtoken";

/**
 * Gera token randômico ~200 chars base64url (ultra difícil de adivinhar).
 */
function generateToken200() {
  return crypto.randomBytes(150).toString("base64url");
}

/**
 * Código curto de 6 dígitos. Ele pode repetir em momentos diferentes,
 * não é "segredo", é só um ID humano-curto de sessão.
 */
function generateWCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Lê cookie wzb_lg do request
 */
function getSessionCookie(req: NextRequest): string | null {
  const cookieHeader = req.headers.get("cookie") || "";
  const entry = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("wzb_lg="));
  if (!entry) return null;
  return entry.replace("wzb_lg=", "");
}

/**
 * Valida JWT e retorna uid do user logado.
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
 * Segurança básica de base64: obriga começar com "data:image/"
 * e um tamanho plausível (evita request gigante absurda).
 */
function isLikelySafeDataUrl(img: string): boolean {
  if (typeof img !== "string") return false;
  if (!img.startsWith("data:image/")) return false;
  // limite ~2MB base64 (~2.6MB real) -> ajusta se quiser
  if (img.length > 2_600_000) return false;
  return true;
}

/* =========================================================================
   POST /api/qrface
   Chamada pelo dashboard.
   Objetivo:
     - garantir que existe 1 (e só 1) sessão ativa pro usuário.
     - se já existir token pendente ou face_captured não expirado → reusar
     - senão criar um novo token + pending_validations.

   Retorna:
     { success, token, url, selfie_b64?, status }
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

    // 1. Marcar como expired qualquer token pendente FACE
    //    que já passou do expires_at e ainda está 'pending_face'
    await db.query(
      `
        UPDATE wzb_tokens
        SET status = 'expired'
        WHERE user_id = ?
          AND status = 'pending_face'
          AND expires_at < NOW()
      `,
      [userId]
    );

    // 2. Buscar se já tem token válido (pending_face OU face_captured)
    //    (ou seja, sessão em andamento / já capturado)
    const [existingRows] = await db.query(
      `
        SELECT
          t.id              AS token_row_id,
          t.token           AS token_string,
          t.status          AS token_status,
          t.expires_at      AS expires_at,
          pv.selfie_b64     AS selfie_b64
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

    const existing = (existingRows as any[])[0];

    if (existing) {
      // se já temos selfie, dashboard já pode mostrar
      const qrUrlExisting = `https://wyzebank.com/qrface/?wzb_token=${existing.token_string}`;
      return NextResponse.json({
        success: true,
        token: existing.token_string,
        url: qrUrlExisting,
        selfie_b64: existing.selfie_b64 || null,
        status: existing.token_status,
      });
    }

    // 3. criar um NOVO token porque não tem ativo válido
    //    gerar token_string único
    let finalToken = "";
    for (let i = 0; i < 5; i++) {
      const candidate = generateToken200();
      const [dupCheck] = await db.query(
        "SELECT token FROM wzb_tokens WHERE token = ? LIMIT 1",
        [candidate]
      );
      if ((dupCheck as any[]).length === 0) {
        finalToken = candidate;
        break;
      }
    }
    if (!finalToken) {
      return NextResponse.json(
        { error: "Falha ao gerar token único" },
        { status: 500 }
      );
    }

    const wCode = generateWCode();

    // 4. inserir novo registro em wzb_tokens
    //    status: pending_face
    //    expires_at: 5 minutos
    const insertResult: any = await db.query(
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
          ?,                -- token string
          ?,                -- user_id
          ?,                -- 6 dígitos humano
          'pending_face',   -- status inicial
          NOW(),
          NULL,
          DATE_ADD(NOW(), INTERVAL 5 MINUTE)
        )
      `,
      [finalToken, userId, wCode]
    );

    // mysql2 pode retornar [result] ou direto result
    const insertedInfo = Array.isArray(insertResult)
      ? insertResult[0]
      : insertResult;
    const newTokenRowId = insertedInfo.insertId;

    // 5. cria linha vazia em pending_validations
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
      [newTokenRowId, finalToken, wCode]
    );

    // 6. responde com URL pra montar QRCode
    const qrUrl = `https://wyzebank.com/qrface/?wzb_token=${finalToken}`;

    return NextResponse.json({
      success: true,
      token: finalToken,
      url: qrUrl,
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
   Chamada pelo celular depois que o usuário capturou a selfie.
   Body:
     { token: string, selfieDataUrl: string }

   Fluxo:
     - valida token existe
     - valida status = 'pending_face'
     - valida não expirado
     - salva selfie em pending_validations
     - marca token como 'face_captured'
 ========================================================================= */
export async function PUT(req: NextRequest) {
  try {
    const { token, selfieDataUrl } = await req.json();

    if (!token || !selfieDataUrl) {
      return NextResponse.json(
        { error: "token e selfieDataUrl são obrigatórios" },
        { status: 400 }
      );
    }

    // sanity check da imagem
    if (!isLikelySafeDataUrl(selfieDataUrl)) {
      return NextResponse.json(
        { error: "Formato de imagem inválido ou muito grande." },
        { status: 400 }
      );
    }

    // busca token
    const [rows] = await db.query(
      `
        SELECT id, status, expires_at
        FROM wzb_tokens
        WHERE token = ?
        LIMIT 1
      `,
      [token]
    );
    const row = (rows as any[])[0];

    if (!row) {
      return NextResponse.json(
        { error: "Token inválido." },
        { status: 404 }
      );
    }

    // expirado?
    const expired =
      row.expires_at && new Date(row.expires_at).getTime() < Date.now();
    if (expired && row.status === "pending_face") {
      // marca como expirado
      await db.query(
        `
          UPDATE wzb_tokens
          SET status = 'expired'
          WHERE id = ?
        `,
        [row.id]
      );
      return NextResponse.json(
        { error: "Token expirado." },
        { status: 400 }
      );
    }

    if (row.status !== "pending_face") {
      return NextResponse.json(
        { error: "Token já utilizado ou bloqueado." },
        { status: 400 }
      );
    }

    // salva selfie
    await db.query(
      `
        UPDATE pending_validations
        SET selfie_b64 = ?, updated_at = NOW()
        WHERE token_id = ?
      `,
      [selfieDataUrl, row.id]
    );

    // marca token como face_captured
    await db.query(
      `
        UPDATE wzb_tokens
        SET status = 'face_captured', used_at = NOW()
        WHERE id = ?
      `,
      [row.id]
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
   GET /api/qrface?token=...
   Chamada pelo DASHBOARD em polling.
   Retorna status atual + selfie_b64 se existir.
   Se selfie_b64 vier preenchida, a UI troca o QR pela foto em tempo real.
 ========================================================================= */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "token é obrigatório" },
        { status: 400 }
      );
    }

    const [rows] = await db.query(
      `
        SELECT 
          t.status        AS token_status,
          t.expires_at    AS expires_at,
          pv.selfie_b64   AS selfie_b64
        FROM wzb_tokens t
        LEFT JOIN pending_validations pv
          ON pv.token_id = t.id
        WHERE t.token = ?
        LIMIT 1
      `,
      [token]
    );

    const row = (rows as any[])[0];
    if (!row) {
      return NextResponse.json(
        { error: "Token não encontrado." },
        { status: 404 }
      );
    }

    // Se já expirou e ainda está pending_face -> o dashboard pode decidir forçar re-gerar
    const expired =
      row.expires_at && new Date(row.expires_at).getTime() < Date.now();

    return NextResponse.json({
      success: true,
      status: expired && row.token_status === "pending_face"
        ? "expired"
        : row.token_status,
      selfie_b64: row.selfie_b64 || null,
    });
  } catch (err: any) {
    console.error("[QRFACE GET ERROR]", err);
    return NextResponse.json(
      { error: err.message || "Erro interno" },
      { status: 500 }
    );
  }
}
