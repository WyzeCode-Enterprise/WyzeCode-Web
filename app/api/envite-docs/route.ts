// app/api/envite-docs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import jwt from "jsonwebtoken";

export const dynamic = "force-dynamic";

/** ===================== Sessão / Segurança ===================== */
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

/** Limites (bytes) para evitar max_allowed_packet e abusos */
const PER_FILE_LIMIT = 6 * 1024 * 1024;      // 6 MB por arquivo (real aproximado)
const COMBINED_LIMIT = 14 * 1024 * 1024;     // 14 MB total (frente+verso+selfie)

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

/** ===================== Concurrency / Retry / Pool Helpers ===================== */

/** Semáforo simples para limitar chamadas simultâneas ao banco a partir desta rota */
class Semaphore {
  private queue: Array<() => void> = [];
  private count = 0;
  constructor(private max: number) {}
  async acquire() {
    if (this.count < this.max) {
      this.count++;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.count++;
  }
  release() {
    this.count = Math.max(0, this.count - 1);
    const next = this.queue.shift();
    if (next) next();
  }
}

// Reutiliza uma instância global (hot reload friendly)
const g: any = globalThis as any;
if (!g.__ENVITE_DOCS_SEM__) g.__ENVITE_DOCS_SEM__ = new Semaphore(Number(process.env.ENVITEDOCS_MAX_CONCURRENCY || 6));
const SEM: Semaphore = g.__ENVITE_DOCS_SEM__;

/** Detecta erros de conexão/transientes que merecem retry */
function isTransientConnErr(err: any): boolean {
  const code = String(err?.code || "").toUpperCase();
  const msg = String(err?.message || "").toLowerCase();
  return (
    code === "ER_CON_COUNT_ERROR" || // 1040 too many connections
    code === "PROTOCOL_CONNECTION_LOST" ||
    code === "PROTOCOL_PACKETS_OUT_OF_ORDER" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    msg.includes("too many connections") ||
    msg.includes("socket hang up")
  );
}

/** Backoff exponencial com jitter */
function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }
function backoffDelay(attempt: number) {
  const base = 150; // ms
  const cap = 1200;
  const exp = Math.min(cap, base * Math.pow(2, attempt));
  const jitter = Math.random() * 120;
  return exp + jitter;
}

/** Executa query com getConnection/release + retry + semáforo */
async function withConnQuery<T = any[]>(
  sql: string,
  params?: any[],
  opts?: { maxRetries?: number; timeoutMs?: number }
): Promise<[T, any]> {
  const maxRetries = Math.max(0, opts?.maxRetries ?? 3);
  const timeoutMs = Math.max(0, opts?.timeoutMs ?? 8000);

  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await SEM.acquire();
    let conn: any = null;
    try {
      conn = await (db as any).getConnection?.();
      if (!conn) {
        // fallback: se db não for Pool, usa direto (mantém compatibilidade)
        const p = (db as any).query(sql, params);
        const res = await Promise.race([
          p,
          sleep(timeoutMs).then(() => { throw new Error("DB query timeout"); }),
        ]) as [T, any];
        return res;
      }
      const p = conn.query(sql, params);
      const res = await Promise.race([
        p,
        sleep(timeoutMs).then(() => { throw new Error("DB query timeout"); }),
      ]) as [T, any];
      return res;
    } catch (err: any) {
      lastErr = err;
      if (conn) { try { conn.release(); } catch {} }
      SEM.release();

      if (attempt < maxRetries && isTransientConnErr(err)) {
        const delay = backoffDelay(attempt);
        await sleep(delay);
        continue; // tenta novamente
      }
      // Erro definitivo
      throw err;
    } finally {
      // release em sucesso
      if (conn) { try { conn.release(); } catch {} }
      // release extra só se não fizemos no catch
      try { SEM.release(); } catch {}
    }
  }
  throw lastErr;
}

/** ===================== Mini-cache para o GET ===================== */
/** Cache curta para evitar estouro por F5. TTL default: 5s */
type LastPendingCacheVal = { last: any | null; status: string | null; locked: boolean; at: number };
if (!g.__ENVITE_DOCS_CACHE__) g.__ENVITE_DOCS_CACHE__ = new Map<number, LastPendingCacheVal>();
const CACHE: Map<number, LastPendingCacheVal> = g.__ENVITE_DOCS_CACHE__;
const CACHE_TTL_MS = Number(process.env.ENVITEDOCS_CACHE_TTL_MS || 5000);

// Deduplicação de requisições em voo por uid
if (!g.__ENVITE_DOCS_INFLIGHT__) g.__ENVITE_DOCS_INFLIGHT__ = new Map<number, Promise<{ last: any; status: string | null; locked: boolean }>>();
const INFLIGHT: Map<number, Promise<{ last: any; status: string | null; locked: boolean }>> = g.__ENVITE_DOCS_INFLIGHT__;

/** ===================== DB Helpers ===================== */
async function fetchFaceSessionByLoginSid(loginSid: string) {
  const [rows] = await withConnQuery<any[]>(
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
  // 1) tenta cache quente
  const now = Date.now();
  const cached = CACHE.get(userId);
  if (cached && (now - cached.at) <= CACHE_TTL_MS) {
    return { last: cached.last, status: cached.status, locked: cached.locked };
  }

  // 2) deduplica chamadas simultâneas
  const existing = INFLIGHT.get(userId);
  if (existing) {
    const r = await existing;
    return r;
  }

  const promise = (async () => {
    const [rows] = await withConnQuery<any[]>(
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

    CACHE.set(userId, { last, status, locked, at: Date.now() });
    return { last, status, locked };
  })();

  INFLIGHT.set(userId, promise);
  try {
    const out = await promise;
    return out;
  } finally {
    INFLIGHT.delete(userId);
  }
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
    // mensagem mais clara se estourar conexão
    if (isTransientConnErr(err)) {
      return json(
        {
          error: "Serviço momentaneamente ocupado. Tente novamente em instantes.",
          code: "DB_BUSY",
        },
        503
      );
    }
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
      return json({ error: "Formato inválido. Use image/* (selfie) e image/* ou PDF (frente/verso)." }, 415);
    }

    // Tamanho real aproximado
    const frontBytes  = approxBinaryBytesFromDataURL(front_b64);
    const backBytes   = approxBinaryBytesFromDataURL(back_b64);
    const selfieBytes = approxBinaryBytesFromDataURL(selfie_b64);

    if (frontBytes === 0 || backBytes === 0 || selfieBytes === 0) {
      return json({ error: "Arquivos inválidos (data URL malformado)." }, 422);
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

    // Insert (com retry/semáforo/conn control)
    try {
      const [insertRes] = await withConnQuery<any>(
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
        ],
        { maxRetries: 3, timeoutMs: 15000 }
      );

      // invalida cache para refletir o novo status imediatamente
      try { CACHE.delete(user_id); } catch {}

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
      if (isTransientConnErr(dbErr)) {
        return json(
          { error: "Serviço de banco ocupado. Tente novamente em instantes.", code: "DB_BUSY" },
          503
        );
      }
      throw dbErr;
    }
  } catch (err: any) {
    console.error("[ENVITE-DOCS POST ERROR]", err);
    return json({ error: err?.message || "Erro interno" }, 500);
  }
}