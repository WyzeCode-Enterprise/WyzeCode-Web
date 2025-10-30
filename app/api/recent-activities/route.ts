// app/api/recent-activities/route.ts
import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/app/api/db";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

type JwtPayload = { uid: number };

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MIN_PAGE_SIZE = 5;
const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 10_000;            // evita scans muito grandes
const MAX_Q_LEN = 100;                // limita custo de LIKE
const QUERY_TIMEOUT_MS = 2500;        // timeout por query
const RETRIES = 1;                    // 1 retry leve em falhas transitórias
const BACKOFF_MS = 80;

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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isValidDateISO(d: string): boolean {
  // YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(`${d}T00:00:00Z`);
  return !isNaN(dt.getTime());
}

// Timeout helper (não cancela no driver, mas evita pendurar a rota)
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

// Retry leve para falhas transitórias (ER_LOCK_DEADLOCK, pool reset, etc.)
async function queryWithRetry<T = any[]>(sql: string, params: any[], retries = RETRIES): Promise<[T, any]> {
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try {
      // importante: cada tentativa com timeout
      // @ts-ignore
      return await withTimeout(db.query(sql, params), QUERY_TIMEOUT_MS);
    } catch (err: any) {
      lastErr = err;
      const transient =
        err?.code === "ER_LOCK_DEADLOCK" ||
        err?.code === "PROTOCOL_CONNECTION_LOST" ||
        err?.code === "ECONNRESET" ||
        err?.message === "QueryTimeout";
      if (!transient || i === retries) break;
      await new Promise((r) => setTimeout(r, BACKOFF_MS * (i + 1)));
    }
  }
  throw lastErr;
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const requestId = randomUUID();

  // Headers padrão pro response
  const baseHeaders = {
    "cache-control": "no-store",
    "x-request-id": requestId,
  } as Record<string, string>;

  try {
    const userId = requireUserIdFromCookie(req);
    const url = new URL(req.url);

    const page = Math.max(1, Number(url.searchParams.get("page") || DEFAULT_PAGE));
    const pageSizeRaw = Number(url.searchParams.get("pageSize") || DEFAULT_PAGE_SIZE);
    const pageSize = clamp(pageSizeRaw, MIN_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = (page - 1) * pageSize;

    // Se o offset for absurdo, evitamos consulta pesada e retornamos vazio "válido"
    if (offset > MAX_OFFSET) {
      const duration = Date.now() - startedAt;
      return NextResponse.json(
        {
          page,
          pageSize,
          total: MAX_OFFSET, // estimativa segura
          items: [],
          hasNextPage: false,
          meta: { degraded: false, estimate: true, requestId, durationMs: duration },
        },
        { headers: baseHeaders }
      );
    }

    const type = (url.searchParams.get("type") || "").trim();
    const status = (url.searchParams.get("status") || "").trim();
    const source = (url.searchParams.get("source") || "").trim();

    let q = (url.searchParams.get("q") || "").trim().replace(/\s+/g, " ");
    if (q.length > MAX_Q_LEN) q = q.slice(0, MAX_Q_LEN);

    const from = (url.searchParams.get("from") || "").trim();
    const to = (url.searchParams.get("to") || "").trim();

    const where: string[] = ["user_id = ?"];
    const params: any[] = [userId];

    if (type)   { where.push("type = ?"); params.push(type); }
    if (status) { where.push("status = ?"); params.push(status); }
    if (source) { where.push("source = ?"); params.push(source); }

    if (q) {
      // LIKE em colunas específicas + índice ajuda; limite de tamanho já aplicado
      where.push("(type LIKE ? OR description LIKE ? OR source LIKE ? OR ip LIKE ? OR user_agent LIKE ?)");
      const pat = `%${q}%`;
      params.push(pat, pat, pat, pat, pat);
    }

    if (from && isValidDateISO(from)) {
      where.push("created_at >= ?");
      params.push(`${from} 00:00:00`);
    }
    if (to && isValidDateISO(to)) {
      where.push("created_at <= ?");
      params.push(`${to} 23:59:59`);
    }

    const whereSql = "WHERE " + where.join(" AND ");

    // Consulta principal
    const listSql = `
      /* recent-activities:list v1 */
      SELECT id, type, status, description, amount_cents, currency, source, ip, user_agent, icon_url, created_at
      FROM user_activity_log
      ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `;
    const countSql = `
      /* recent-activities:count v1 */
      SELECT COUNT(*) AS total
      FROM user_activity_log
      ${whereSql}
    `;

    // 1) Busca itens
    const [rows] = await queryWithRetry<any[]>(listSql, [...params, pageSize, offset]);

    // 2) Count (se falhar, fazemos fallback estimado)
    let total = 0;
    let estimate = false;
    try {
      const [countRows] = await queryWithRetry<any[]>(countSql, params);
      total = Number(countRows?.[0]?.total ?? 0);
      if (!Number.isFinite(total)) total = 0;
    } catch {
      // Fallback: estimativa segura baseada na página atual
      total = offset + rows.length + (rows.length === pageSize ? 1 : 0);
      estimate = true;
    }

    const hasNextPage = offset + rows.length < total;

    const duration = Date.now() - startedAt;
    return NextResponse.json(
      {
        page,
        pageSize,
        total,
        items: rows ?? [],
        hasNextPage,
        nextPage: hasNextPage ? page + 1 : null,
        meta: { degraded: false, estimate, requestId, durationMs: duration },
      },
      { headers: baseHeaders }
    );
  } catch (err: any) {
    const duration = Date.now() - startedAt;

    // Não autenticado
    if (err?.message === "Unauthorized") {
      return NextResponse.json(
        { error: "Unauthorized", meta: { requestId, durationMs: duration } },
        { status: 401, headers: baseHeaders }
      );
    }

    // Fallback seguro: não derruba a UI (200 com payload vazio e sinalizador degraded)
    // Obs.: Se preferir manter 500 para observabilidade, troque '200' por '500'.
    return NextResponse.json(
      {
        page: DEFAULT_PAGE,
        pageSize: DEFAULT_PAGE_SIZE,
        total: 0,
        items: [],
        hasNextPage: false,
        nextPage: null,
        meta: {
          degraded: true,
          estimate: false,
          requestId,
          durationMs: duration,
          error: process.env.NODE_ENV === "production" ? "TemporaryUnavailable" : String(err?.message || err),
        },
      },
      { status: 200, headers: baseHeaders }
    );
  }
}