import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import crypto from "crypto";

/**
 * Gera um token aleatório gigante (200 chars base64url safe)
 * - 150 bytes ~ 200 chars base64url
 */
function generateToken200() {
  return crypto.randomBytes(150).toString("base64url"); // sem '=' e URL-safe
}

/**
 * POST /api/qrface
 *
 * body esperado: { userId: number }
 *
 * - Gera um token único e insere em wzb_tokens.
 * - Retorna { token, url }
 *
 * Esse endpoint é chamado pelo dashboard pra gerar o QR.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: "userId obrigatório" },
        { status: 400 }
      );
    }

    // tenta gerar token único
    let finalToken = "";
    for (let i = 0; i < 5; i++) {
      const candidate = generateToken200();
      // checa se já existe
      const [rows] = await db.query(
        "SELECT token FROM wzb_tokens WHERE token = ? LIMIT 1",
        [candidate]
      );
      if ((rows as any[]).length === 0) {
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

    // insere no banco
    await db.query(
      `INSERT INTO wzb_tokens (
        token,
        user_id,
        selfie_b64,
        status,
        created_at
      ) VALUES (?, ?, NULL, 'pending_face', NOW())`,
      [finalToken, userId]
    );

    // monta URL que vai pro QR
    const qrUrl = `https://wyzebank.com/qrface/?wzb_token=${finalToken}`;

    return NextResponse.json({
      success: true,
      token: finalToken,
      url: qrUrl,
    });
  } catch (err: any) {
    console.error("[QRFACE POST ERROR]", err);
    return NextResponse.json(
      { error: err.message || "Erro interno" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/qrface
 *
 * body esperado:
 * {
 *   token: string,
 *   selfieDataUrl: string (ex: "data:image/jpeg;base64,...")
 * }
 *
 * - Salva a foto na linha correspondente ao token.
 * - Marca como "face_captured" e coloca used_at.
 */
export async function PUT(req: NextRequest) {
  try {
    const { token, selfieDataUrl } = await req.json();

    if (!token || !selfieDataUrl) {
      return NextResponse.json(
        { error: "token e selfieDataUrl são obrigatórios" },
        { status: 400 }
      );
    }

    // garante que token existe e ainda está válido
    const [rows] = await db.query(
      "SELECT id, status FROM wzb_tokens WHERE token = ? LIMIT 1",
      [token]
    );
    const row = (rows as any)[0];

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

    // salva selfie
    await db.query(
      `UPDATE wzb_tokens
       SET selfie_b64 = ?, status = 'face_captured', used_at = NOW()
       WHERE token = ?`,
      [selfieDataUrl, token]
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

/**
 * GET /api/qrface?token=...
 *
 * - Retorna status e, se já capturou, retorna a selfie.
 * - Isso permite no dashboard você trocar o QR pela foto da pessoa em tempo real.
 */
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
      `SELECT status, selfie_b64 FROM wzb_tokens WHERE token=? LIMIT 1`,
      [token]
    );
    const row = (rows as any)[0];

    if (!row) {
      return NextResponse.json(
        { error: "Token não encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      status: row.status,
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
