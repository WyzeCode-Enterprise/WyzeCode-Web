import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import crypto from "crypto";
import jwt from "jsonwebtoken";

/**
 * CONFIG
 */
const TOKEN_LIFETIME_MIN = 5;
const EXPIRE_GRACE_SECONDS = 2;

// segredo pra assinar o ticket da sessão facial
// use uma env específica se quiser separar do login normal
const FACE_SESSION_SECRET =
  process.env.FACE_SESSION_SECRET || process.env.JWT_SECRET || "supersecretkey";

/**
 * Gera token randômico grande só pra auditoria interna (não usamos mais pra lookup).
 * Isso ainda é útil pra ter um "nonce" forte atrelado à sessão no banco.
 */
function generateInternalToken() {
  return crypto.randomBytes(150).toString("base64url"); // ~200 chars URL-safe
}

/**
 * Código humano de 6 dígitos pra debug/atendimento
 */
function generateWCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Lê cookie de sessão principal (login do dashboard)
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
 * Valida o JWT de login do dashboard e retorna o user_id
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
 * Assina um "ticket" curto que representa a sessão de face.
 * Esse ticket vai parar dentro do QR e depois vai voltar do celular.
 * payload mínimo = { sid: <id da linha wzb_tokens> }
 */
function signFaceSessionTicket(sessionId: number) {
  const payload = { sid: sessionId };
  // expiração no próprio JWT também, belt & suspenders
  const expiresInSec = TOKEN_LIFETIME_MIN * 60 + EXPIRE_GRACE_SECONDS;
  return jwt.sign(payload, FACE_SESSION_SECRET, { expiresIn: expiresInSec });
}

/**
 * Lê o ticket e devolve { sid } ou null se inválido / expirado.
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
 * sanity check da imagem base64
 */
function isLikelySafeDataUrl(img: string): boolean {
  if (typeof img !== "string") return false;
  if (!img.startsWith("data:image/")) return false;
  // ~2.6MB base64 máx
  if (img.length > 2_600_000) return false;
  return true;
}

/**
 * Marca qualquer sessão 'pending_face' desse usuário que já estourou o tempo como 'expired'.
 * Usa uma folga de alguns segundos pra evitar drift de relógio.
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
 * true se já passou do expires_at + grace
 */
function isExpiredWithGrace(expires_at: any): boolean {
  if (!expires_at) return false;
  const expMs = new Date(expires_at).getTime();
  const nowMs = Date.now();
  return expMs + EXPIRE_GRACE_SECONDS * 1000 < nowMs;
}

/* =========================================================================
   POST /api/qrface
   Chamado pelo DASHBOARD autenticado.

   Fluxo:
   - expira sessões antigas 'pending_face' do usuário
   - tenta reusar uma sessão ativa ('pending_face' ou 'face_captured')
   - se não tiver, cria nova linha em `wzb_tokens` e `pending_validations`
   - gera um "sessionTicket" que contém o ID interno (sid)
   - retorna URL pra gerar o QR
 ========================================================================= */
export async function POST(req: NextRequest) {
  try {
    // autenticar o usuário no dashboard
    const rawSession = getSessionCookie(req);
    const userId = getUserIdFromSessionToken(rawSession);
    if (!userId) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    // expira possíveis pendentes antigos
    await expireStaleTokensForUser(userId);

    // tenta reusar sessão existente
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
      // gera ticket baseado no ID interno
      const sessionTicket = signFaceSessionTicket(active.token_row_id);

      return NextResponse.json({
        success: true,
        session: sessionTicket,
        url: `https://wyzebank.com/qrface?session=${encodeURIComponent(
          sessionTicket
        )}`,
        selfie_b64: active.selfie_b64 || null,
        status: active.token_status, // 'pending_face' ou 'face_captured'
      });
    }

    // se não tem ativa → criar nova
    const internalToken = generateInternalToken();
    const wCode = generateWCode();

    const insertRes: any = await db.query(
      `
        INSERT INTO wzb_tokens (
          token,        -- interno, grande, pra auditoria
          user_id,
          w_code,
          status,
          created_at,
          used_at,
          expires_at
        )
        VALUES (
          ?,            -- token interno randômico
          ?,            -- user_id
          ?,            -- w_code humano
          'pending_face',
          NOW(),
          NULL,
          DATE_ADD(NOW(), INTERVAL ${TOKEN_LIFETIME_MIN} MINUTE)
        )
      `,
      [internalToken, userId, wCode]
    );

    const insertedInfo = Array.isArray(insertRes) ? insertRes[0] : insertRes;
    const newTokenRowId = insertedInfo.insertId as number;

    // cria pending_validations ligada por FK token_id
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

    // gera ticket seguro e curto pro QR
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
   helper: pega info da sessão (sid) direto do banco
   - usado pelo GET e pelo PUT
 ========================================================================= */
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
   PUT /api/qrface
   Chamado PELO CELULAR depois da captura.

   Body: { session: string, selfieDataUrl: string }

   Fluxo:
   - decodifica o ticket (JWT) → pega sid
   - busca sessão no banco pelo ID sid
   - se expirou e ainda tá pending_face → marca expired e bloqueia
   - se status != pending_face → bloqueia
   - salva selfie e marca face_captured
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

    const expired = isExpiredWithGrace(sess.expires_at);

    if (expired && sess.status === "pending_face") {
      // atualiza pra expired
      await db.query(
        `
          UPDATE wzb_tokens
          SET status = 'expired'
          WHERE id = ?
        `,
        [sess.token_id]
      );

      return NextResponse.json(
        { error: "Sessão expirada, gere outro QR." },
        { status: 400 }
      );
    }

    if (sess.status !== "pending_face") {
      return NextResponse.json(
        { error: "Sessão já utilizada / bloqueada." },
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
      [selfieDataUrl, sess.token_id]
    );

    // marca completa
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
   Usado tanto:
   - pelo DASHBOARD (polling)
   - pelo CELULAR logo que abre pra validar se a sessão é válida

   Fluxo:
   - decodifica ticket → sid
   - consulta banco
   - responde {status, selfie_b64}
   - se expirou & ainda pending_face → status = "expired"
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
          : sess.status, // pending_face | face_captured | expired | etc
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
