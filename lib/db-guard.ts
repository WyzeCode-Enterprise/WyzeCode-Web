// app/api/lib/db-guard.ts
import type { Pool, PoolConnection, QueryOptions, RowDataPacket } from "mysql2/promise";
import { db } from "../app/api/db"; // ⬅️ caminho correto (lib -> ../db)

/**
 * Config padrão do guard — ajuste se quiser.
 */
const DEFAULTS = {
  maxConcurrent: 8,
  maxQueue: 200,
  acquireTimeoutMs: 12_000,
  maxRetries: 3,
  baseBackoffMs: 150,
  inflightDedupWindowMs: 350,
};

type GuardOptions = Partial<typeof DEFAULTS>;
type SQL = string | QueryOptions;
type Params = any[] | Record<string, any>;
type QueryResult<T> = [T[], any];

/** Semáforo simples + fila */
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];
  private readonly maxQueue: number;

  constructor(permits: number, maxQueue: number) {
    this.permits = permits;
    this.maxQueue = maxQueue;
  }

  acquire(timeoutMs: number): Promise<() => void> {
    return new Promise((resolve, reject) => {
      const tryGrant = () => {
        if (this.permits > 0) {
          this.permits--;
          resolve(() => this.release());
          return true;
        }
        return false;
      };

      if (tryGrant()) return;

      if (this.queue.length >= this.maxQueue) {
        reject(Object.assign(new Error("DB_QUEUE_SATURATED"), { code: "DB_QUEUE_SATURATED" }));
        return;
      }

      let settled = false;
      const ticket = () => {
        if (!settled && tryGrant()) {
          settled = true;
        }
      };

      this.queue.push(ticket);

      const t = setTimeout(() => {
        if (!settled) {
          const idx = this.queue.indexOf(ticket);
          if (idx >= 0) this.queue.splice(idx, 1);
          reject(Object.assign(new Error("DB_ACQUIRE_TIMEOUT"), { code: "DB_ACQUIRE_TIMEOUT" }));
        }
      }, timeoutMs);

      const wrappedResolve = (release: () => void) => {
        clearTimeout(t);
        resolve(release);
      };

      this.queue[this.queue.length - 1] = () => {
        if (!settled && tryGrant()) {
          settled = true;
          wrappedResolve(() => this.release());
        }
      };
    });
  }

  private release() {
    this.permits++;
    const next = this.queue.shift();
    if (next) next();
  }
}

/** dedupe de requisições idênticas */
type InflightKey = string;
type InflightEntry<T> = { promise: Promise<T>; ts: number };
class InflightMap {
  private map = new Map<InflightKey, InflightEntry<any>>();
  get<T>(k: InflightKey, windowMs: number): Promise<T> | null {
    const v = this.map.get(k);
    if (!v) return null;
    if (Date.now() - v.ts <= windowMs) return v.promise as Promise<T>;
    this.map.delete(k);
    return null;
  }
  set<T>(k: InflightKey, p: Promise<T>) {
    this.map.set(k, { promise: p, ts: Date.now() });
    p.finally(() => this.map.delete(k));
  }
}

/** instancia global (persistida em HMR) */
function getGlobal<T>(key: string, factory: () => T): T {
  const g = globalThis as any;
  if (!g[key]) g[key] = factory();
  return g[key] as T;
}

const guard = getGlobal("__DB_GUARD__", () => ({
  sem: new Semaphore(DEFAULTS.maxConcurrent, DEFAULTS.maxQueue),
  inflight: new InflightMap(),
  opts: { ...DEFAULTS },
}));

/** erros transitórios que merecem retry */
function isTransient(e: any): boolean {
  const code = (e?.code || e?.errno || e?.sqlState || e?.name || "").toString();
  const list = new Set([
    "ER_CON_COUNT_ERROR",
    "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
    "PROTOCOL_CONNECTION_LOST",
    "PROTOCOL_PACKETS_OUT_OF_ORDER",
    "ECONNRESET",
    "ETIMEDOUT",
    "EPIPE",
  ]);
  return list.has(code);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function backoff(attempt: number, base: number) {
  const exp = Math.min(6, attempt);
  const jitter = Math.floor(Math.random() * base);
  return base * 2 ** exp + jitter;
}

/**
 * safeQuery: concorrência limitada + fila + retries + dedupe
 */
export async function safeQuery<T extends RowDataPacket = any>(
  sql: SQL,
  params?: Params,
  options?: GuardOptions
): Promise<QueryResult<T>> {
  const { sem, inflight, opts } = guard;
  const cfg = { ...opts, ...(options || {}) };

  const key = typeof sql === "string"
    ? `S:${sql}|P:${JSON.stringify(params || [])}`
    : `O:${JSON.stringify(sql)}|P:${JSON.stringify(params || [])}`;

  const hit = inflight.get<QueryResult<T>>(key, cfg.inflightDedupWindowMs);
  if (hit) return hit;

  const execPromise = (async () => {
    let release: (() => void) | null = null;
    try {
      release = await sem.acquire(cfg.acquireTimeoutMs);

      let lastErr: any = null;
      for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
        try {
          // ⚠️ sem genérico aqui: captura e faz cast seguro
          const result = await (db as Pool).query(sql as any, params as any);
          const rows = (result as any)[0] as T[];    // rows
          const fields = (result as any)[1];         // fields
          return [rows, fields] as QueryResult<T>;
        } catch (e: any) {
          lastErr = e;
          if (!isTransient(e) || attempt === cfg.maxRetries) throw e;
          await sleep(backoff(attempt, cfg.baseBackoffMs));
        }
      }
      throw lastErr ?? new Error("DB_UNKNOWN_ERROR");
    } finally {
      if (release) release();
    }
  })();

  inflight.set(key, execPromise);
  return execPromise;
}

/**
 * withTransaction: executa função dentro de transação com retries.
 */
export async function withTransaction<T>(
  fn: (conn: PoolConnection) => Promise<T>,
  options?: GuardOptions
): Promise<T> {
  const { sem, opts } = guard;
  const cfg = { ...opts, ...(options || {}) };

  let release: (() => void) | null = null;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      release = await sem.acquire(cfg.acquireTimeoutMs);
      const conn = await (db as Pool).getConnection();
      try {
        await conn.beginTransaction();
        const result = await fn(conn);
        await conn.commit();
        conn.release();
        release();
        release = null;
        return result;
      } catch (e) {
        try { await conn.rollback(); } catch {}
        conn.release();
        throw e;
      }
    } catch (e: any) {
      if (!isTransient(e) || attempt === cfg.maxRetries) {
        if (release) release();
        throw e;
      }
      if (release) { release(); release = null; }
      await sleep(backoff(attempt, cfg.baseBackoffMs));
    }
  }

  throw Object.assign(new Error("DB_TX_FAILED"), { code: "DB_TX_FAILED" });
}
