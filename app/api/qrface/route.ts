import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import crypto from "crypto";
import jwt from "jsonwebtoken";

// gera token único ~200 chars (base64url)
function generateToken200() {
  return crypto.randomBytes(150).toString("base64url");
}

// gera código curto de 6 dígitos numéricos
function generateWCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// pega o cookie wzb_lg do request
function getSessionCookie(req: NextRequest): string | null {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("wzb_lg="));
  if (!match) return null;
  return match.replace("wzb_lg=", "");
}

// valida JWT e devolve uid
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
    console.error("[qrface POST] JWT inválido:", err);
    return null;
  }
}

// =======================================================================
// POST /api/qrface
// - dashboard chama isso pra gerar (ou reutilizar) o QR daquele usuário
// =======================================================================
export async function POST(req: NextRequest) {
  try {
    // 1. autenticação via cookie
    const rawSession = getSessionCookie(req);
    const userId = getUserIdFromSessionToken(rawSession);

    if (!userId) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    // 2. tenta reutilizar um token ativo existente
    //    status pendente_face ou já capturou rosto
    //    agora JOIN usando pv.token_id = t.id
    const [existingRows] = await db.query(
      `
        SELECT
          t.id            AS token_row_id,
          t.token         AS token_string,
          t.status        AS token_status,
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

    const existing = (existingRows as any[])[0];

    if (existing) {
      const qrUrlExisting = `https://wyzebank.com/qrface/?wzb_token=${existing.token_string}`;

      return NextResponse.json({
        success: true,
        token: existing.token_string,
        url: qrUrlExisting,
        selfie_b64: existing.selfie_b64 || null,
        status: existing.token_status,
      });
    }

    // 3. não tem token ativo -> gerar novo token_string + w_code
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

    // 4. insere na wzb_tokens
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
          ?,                -- token string único
          ?,                -- user_id
          ?,                -- w_code (6 dígitos)
          'pending_face',   -- status inicial
          NOW(),            -- created_at
          NULL,             -- used_at
          DATE_ADD(NOW(), INTERVAL 5 MINUTE) -- expires_at
        )
      `,
      [finalToken, userId, wCode]
    );

    // MUITO IMPORTANTE:
    // insertResult[0].insertId em mysql2
    // insertResult.insertId em alguns setups.
    // vamos cobrir as duas:
    const insertedInfo = Array.isArray(insertResult)
      ? insertResult[0]
      : insertResult;
    const newTokenRowId = insertedInfo.insertId;

    // 5. insere linha inicial em pending_validations
    //    AGORA obedecendo FK:
    //    - token_id (FK obrigatória)
    //    - qr_token (string do token pra lookup fácil do mobile)
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

    // 6. responde com a URL pra gerar o QR
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

// =======================================================================
// PUT /api/qrface
// - chamado NO CELULAR, depois que o usuário tira a selfie
// body: { token: string, selfieDataUrl: string }
// =======================================================================
export async function PUT(req: NextRequest) {
  try {
    const { token, selfieDataUrl } = await req.json();

    if (!token || !selfieDataUrl) {
      return NextResponse.json(
        { error: "token e selfieDataUrl são obrigatórios" },
        { status: 400 }
      );
    }

    // 1. garantir que o token existe e ainda tá válido/pending
    const [rows] = await db.query(
      `
        SELECT id, status
        FROM wzb_tokens
        WHERE token = ?
        LIMIT 1
      `,
      [token]
    );
    const row = (rows as any[])[0];

    if (!row) {
      return NextResponse.json(
        { error: "Token inválido" },
        { status: 404 }
      );
    }

    if (row.status !== "pending_face") {
      return NextResponse.json(
        { error: "Token já utilizado / expirado" },
        { status: 400 }
      );
    }

    // 2. salva a selfie na pending_validations correspondente
    await db.query(
      `
        UPDATE pending_validations
        SET selfie_b64 = ?, updated_at = NOW()
        WHERE token_id = ?
      `,
      [selfieDataUrl, row.id]
    );

    // 3. marca o token como face_captured
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

// =======================================================================
// GET /api/qrface?token=...   (polling do dashboard)
// - dashboard chama isso de X em X segundos pra saber se já chegou a selfie
// =======================================================================
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

    // busca status atual do token e a selfie (se já foi tirada)
    const [rows] = await db.query(
      `
        SELECT 
          t.status        AS token_status,
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
        { error: "Token não encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      status: row.token_status,
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
