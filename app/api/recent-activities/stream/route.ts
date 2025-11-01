// app/api/recent-activities/stream/route.ts
import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/app/api/db";

export const runtime = "nodejs";

type JwtPayload = { uid: number };

/* ========= Configs (ajustáveis por ENV) ========= */
const QUERY_TIMEOUT_MS = Number(process.env.ENV_RA_STREAM_Q_TIMEOUT_MS || 2000);
const RETRIES = Number(process.env.ENV_RA_STREAM_RETRIES || 2);
const BASE_TICK_MS = Number(process.env.ENV_RA_STREAM_BASE_TICK_MS || 1500);
const MAX_TICK_MS = Number(process.env.ENV_RA_STREAM_MAX_TICK_MS || 8000);
const HEARTBEAT_MS = Number(process.env.ENV_RA_STREAM_HEARTBEAT_MS || 20000);
const ROWS_PER_TICK = Number(process.env.ENV_RA_STREAM_ROWS_PER_TICK || 50);

/* Limita quantos streams simultâneos um mesmo usuário pode abrir (guarda em memória) */
const MAX_STREAMS_PER_USER = Number(process.env.ENV_RA_STREAMS_PER_USER || 3);

/* Rate limit simples por usuário para ABRIR streams (token-bucket em memória) */
const RL_CAP = Number(process.env.ENV_RA_STREAM_RL_CAP || 6);
const RL_REFILL_MS = Number(process.env.ENV_RA_STREAM_RL_REFILL_MS || 1000);

/* Semáforo (limita queries concorrentes dessa rota no processo) */
const g: any = globalThis as any;
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
if (!g.__RA_STREAM_SEM__) {
  g.__RA_STREAM_SEM__ = new Semaphore(Number(process.env.ENV_RA_STREAM_MAX_CONCURRENCY || 8));
}
const SEM: Semaphore = g.__RA_STREAM_SEM__;

/* Tabelas em memória para controle */
if (!g.__RA_STREAM_USER_COUNT__) g.__RA_STREAM_USER_COUNT__ = new Map<number, number>();
const USER_STREAMS: Map<number, number> = g.__RA_STREAM_USER_COUNT__;

type Bucket = { tokens: number; lastRefill: number };
if (!g.__RA_STREAM_BUCKETS__) g.__RA_STREAM_BUCKETS__ = new Map<number, Bucket>();
const BUCKETS: Map<number, Bucket> = g.__RA_STREAM_BUCKETS__;

/* ========= Helpers comuns ========= */
function requireUserIdFromCookie(req: NextRequest): number {
  const session = req.cookies.get("wzb_lg")?.value;
  if (!session) throw new Error("Unauthorized");
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(session, process.env.JWT_SECRET || "supersecretkey") as JwtPayload;
  } catch {
    throw new Error("Unauthorized");
  }
  const uid = Number(decoded.uid);
  if (!Number.isFinite(uid) || uid <= 0) throw new Error("Unauthorized");
  return uid;
}
function isValidDateISO(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(`${d}T00:00:00Z`);
  return !isNaN(dt.getTime());
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function jitter(ms: number) {
  const delta = Math.min(300, Math.max(50, ms * 0.15));
  return ms + (Math.random() * 2 - 1) * delta;
}
function isTransientConnErr(err: any): boolean {
  const code = String(err?.code || "").toUpperCase();
  const msg = String(err?.message || "").toLowerCase();
  return (
    code === "ER_CON_COUNT_ERROR" ||
    code === "PROTOCOL_CONNECTION_LOST" ||
    code === "PROTOCOL_PACKETS_OUT_OF_ORDER" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ER_LOCK_DEADLOCK" ||
    msg.includes("too many connections") ||
    msg.includes("socket hang up") ||
    msg.includes("timeout")
  );
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("QueryTimeout")), ms);
  });
  try {
    // @ts-ignore
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/** Query usando pool getConnection()/release(), timeout, retry e semáforo */
async function withConnQuery<T = any[]>(
  sql: string,
  params: any[],
  opts?: { retries?: number; timeoutMs?: number }
): Promise<[T, any]> {
  const retries = Math.max(0, opts?.retries ?? RETRIES);
  const timeoutMs = Math.max(0, opts?.timeoutMs ?? QUERY_TIMEOUT_MS);

  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await SEM.acquire();
    let conn: any = null;
    try {
      conn = await (db as any).getConnection?.();
      if (!conn) {
        const res = (await withTimeout((db as any).query(sql, params), timeoutMs)) as [T, any];
        return res;
      }
      const res = (await withTimeout(conn.query(sql, params), timeoutMs)) as [T, any];
      return res;
    } catch (err: any) {
      lastErr = err;
      if (conn) {
        try { conn.release(); } catch {}
      }
      SEM.release();
      if (attempt < retries && isTransientConnErr(err)) {
        const back = Math.min(MAX_TICK_MS, jitter(300 * Math.pow(2, attempt)));
        await sleep(back);
        continue;
      }
      throw err;
    } finally {
      if (conn) { try { conn.release(); } catch {} }
      try { SEM.release(); } catch {}
    }
  }
  throw lastErr;
}

/* Rate limit para ABERTURA do stream */
function takeToken(uid: number): { ok: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const b = BUCKETS.get(uid) || { tokens: RL_CAP, lastRefill: now };
  const steps = Math.floor((now - b.lastRefill) / RL_REFILL_MS);
  if (steps > 0) {
    b.tokens = Math.min(RL_CAP, b.tokens + steps);
    b.lastRefill = b.lastRefill + steps * RL_REFILL_MS;
  }
  if (b.tokens <= 0) {
    const nextIn = RL_REFILL_MS - (now - b.lastRefill);
    BUCKETS.set(uid, b);
    return { ok: false, retryAfterMs: Math.max(100, nextIn) };
  }
  b.tokens -= 1;
  BUCKETS.set(uid, b);
  return { ok: true };
}

/* ========= Handler ========= */
export async function GET(req: NextRequest) {
  try {
    const userId = requireUserIdFromCookie(req);

    /* Limite de streams simultâneos por usuário */
    const current = USER_STREAMS.get(userId) || 0;
    if (current >= MAX_STREAMS_PER_USER) {
      return new Response(
        `event: error\ndata: ${JSON.stringify({ error: "TooManyStreams", detail: "Limite de streams simultâneos atingido." })}\n\n`,
        { status: 429, headers: { "Content-Type": "text/event-stream", "Retry-After": "2" } }
      );
    }

    /* Rate limit para novas conexões SSE */
    const rl = takeToken(userId);
    if (!rl.ok) {
      return new Response(
        `event: error\ndata: ${JSON.stringify({ error: "TooManyRequests", retryAfterMs: rl.retryAfterMs })}\n\n`,
        { status: 429, headers: { "Content-Type": "text/event-stream", "Retry-After": String(Math.ceil((rl.retryAfterMs || 1000)/1000)) } }
      );
    }

    /* Marca 1 stream ativo desse usuário */
    USER_STREAMS.set(userId, current + 1);

    const url = new URL(req.url);
    const type = (url.searchParams.get("type") || "").trim();
    const status = (url.searchParams.get("status") || "").trim();
    const source = (url.searchParams.get("source") || "").trim();
    const q = (url.searchParams.get("q") || "").trim();
    const from = (url.searchParams.get("from") || "").trim();
    const to = (url.searchParams.get("to") || "").trim();
    const at = (url.searchParams.get("at") || "").trim();
    const sinceMs = Number(url.searchParams.get("since") || Date.now());
    let lastSeen = new Date(isNaN(sinceMs) ? Date.now() : sinceMs);

    /* Quando tem ?at=, consulta apenas o alvo e depois entra em heartbeats com tick mais lento */
    const UUID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
    const hasAT = !!at && UUID_RE.test(at);

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        let active = true;
        let ticking = false;
        let tickDelay = BASE_TICK_MS;

        function sendHeartbeat() {
          controller.enqueue(enc.encode(`event: heartbeat\ndata: {}\n\n`));
        }
        function sendItem(item: any) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(item)}\n\n`));
        }
        function sendError(obj: any) {
          controller.enqueue(enc.encode(`event: error\ndata: ${JSON.stringify(obj)}\n\n`));
        }

        /* Heartbeat */
        const hb = setInterval(() => { if (active) sendHeartbeat(); }, HEARTBEAT_MS);

        /* Monta o WHERE a cada tick de acordo com filtros */
        function buildWhere() {
          const where: string[] = [];
          const params: any[] = [];

          if (hasAT) {
            where.push("user_id = ? AND at_token = ?");
            params.push(userId, at);
          } else {
            where.push("user_id = ? AND created_at > ?");
            params.push(userId, lastSeen);
          }
          if (type)   { where.push("type = ?"); params.push(type); }
          if (status) { where.push("status = ?"); params.push(status); }
          if (source) { where.push("source = ?"); params.push(source); }
          if (q) {
            where.push("(type LIKE ? OR description LIKE ? OR source LIKE ? OR ip LIKE ? OR user_agent LIKE ?)");
            const pat = `%${q}%`;
            params.push(pat, pat, pat, pat, pat);
          }
          if (from && isValidDateISO(from)) { where.push("created_at >= ?"); params.push(`${from} 00:00:00`); }
          if (to && isValidDateISO(to)) { where.push("created_at <= ?"); params.push(`${to} 23:59:59`); }

          const whereSql = "WHERE " + where.join(" AND ");
          return { whereSql, params };
        }

        async function tick() {
          if (!active || ticking) return;
          ticking = true;

          try {
            const { whereSql, params } = buildWhere();
            const sql = `
/* recent-activities:stream tick v2 (full) */
SELECT
  id, user_id,
  at_token, at_type,
  type, status, description,
  amount_cents, currency, source,
  ip, user_agent, icon_url, created_at,

  request_id, correlation_id, session_id, device_id,
  kyc_level, risk_score, risk_flags,
  environment,
  location_city, location_region, location_country, location_asn,

  http_method, http_path, http_status, http_latency_ms, http_idempotency_key,
  tls_version, tls_cipher,

  payment_card_brand, payment_card_last4, payment_installment_count, payment_gateway_code, payment_chargeback,

  webhook_attempts, webhook_last_status,

  customer_id, merchant_id
FROM user_activity_log
${whereSql}
ORDER BY created_at ASC, id ASC
LIMIT ?
            `;
            const [rows] = await withConnQuery<any[]>(sql, [...params, ROWS_PER_TICK], { retries: RETRIES, timeoutMs: QUERY_TIMEOUT_MS });

            const items = Array.isArray(rows) ? rows : [];
            if (items.length) {
              let maxDate = lastSeen;
              for (const it of items) {
                sendItem(it);
                const ts = new Date(it.created_at);
                if (!hasAT && ts > maxDate) maxDate = ts;
              }
              lastSeen = maxDate;
              /* Em sucesso, reduza o delay para reatividade */
              tickDelay = Math.max(800, Math.floor(tickDelay * 0.85));
            } else {
              /* Sem novidades, aumente levemente o intervalo (até o teto) */
              tickDelay = Math.min(MAX_TICK_MS, Math.floor(tickDelay * 1.15));
            }
          } catch (err: any) {
            if (isTransientConnErr(err) || err?.message === "QueryTimeout") {
              tickDelay = Math.min(MAX_TICK_MS, Math.floor(tickDelay * 1.5));
            } else {
              sendError({ error: "StreamQueryError", detail: String(err?.message || err) });
              tickDelay = Math.min(MAX_TICK_MS, Math.floor(tickDelay * 1.5));
            }
          } finally {
            ticking = false;
            if (active) setTimeout(() => tick(), jitter(tickDelay));
          }
        }

        /* Estratégia inicial */
        if (hasAT) {
          tickDelay = 1200;
          tick();
        } else {
          tickDelay = BASE_TICK_MS;
          setTimeout(() => tick(), jitter(tickDelay));
        }

        /* Encerrar corretamente no abort */
        req.signal.addEventListener("abort", () => {
          active = false;
          clearInterval(hb);
          try { controller.close(); } catch {}
          const curr = USER_STREAMS.get(userId) || 1;
          USER_STREAMS.set(userId, Math.max(0, curr - 1));
        });
      },
      cancel() {
        const curr = USER_STREAMS.get(userId) || 1;
        USER_STREAMS.set(userId, Math.max(0, curr - 1));
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err: any) {
    const unauthorized = err?.message === "Unauthorized";
    return new Response(
      `event: error\ndata: ${JSON.stringify({ error: unauthorized ? "Unauthorized" : "InternalError" })}\n\n`,
      { status: unauthorized ? 401 : 500, headers: { "Content-Type": "text/event-stream" } }
    );
  }
}
