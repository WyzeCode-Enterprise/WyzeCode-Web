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
const MAX_OFFSET = 10_000;
const MAX_Q_LEN = 100;
const QUERY_TIMEOUT_MS = 2500;
const RETRIES = 1;
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = new Date(`${d}T00:00:00Z`);
  return !isNaN(dt.getTime());
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

async function queryWithRetry<T = any[]>(sql: string, params: any[], retries = RETRIES): Promise<[T, any]> {
  let lastErr: any;
  for (let i = 0; i <= retries; i++) {
    try {
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

  const baseHeaders = {
    "cache-control": "no-store",
    "x-request-id": requestId,
  } as Record<string, string>;

  try {
    const userId = requireUserIdFromCookie(req);
    const url = new URL(req.url);

    const at = (url.searchParams.get("at") || "").trim();
    const idParam = url.searchParams.get("id");

    // Se veio ?at= (token fixo), devolvemos apenas aquele registro (do usuário),
    // ignorando paginação/filtros e já incluindo o campo at_token no payload.
    if (at) {
      // sanity check básico (UUID v4) — aceita minúsculas/maiúsculas
      const uuidRe = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
      if (!uuidRe.test(at)) {
        return NextResponse.json(
          {
            page: 1,
            pageSize: 1,
            total: 0,
            items: [],
            hasNextPage: false,
            meta: { degraded: false, estimate: false, requestId, durationMs: Date.now() - startedAt },
          },
          { headers: baseHeaders }
        );
      }

      const [rows] = await queryWithRetry<any[]>(
        `
          /* recent-activities:by_at v1 */
          SELECT id, at_token, type, status, description, amount_cents, currency, source, ip, user_agent, icon_url, created_at
            FROM user_activity_log
           WHERE user_id = ? AND at_token = ?
           LIMIT 1
        `,
        [userId, at]
      );

      const items = Array.isArray(rows) ? rows : [];
      const duration = Date.now() - startedAt;
      return NextResponse.json(
        {
          page: 1,
          pageSize: 1,
          total: items.length,
          items,
          hasNextPage: false,
          nextPage: null,
          meta: { degraded: false, estimate: false, requestId, durationMs: duration },
        },
        { headers: baseHeaders }
      );
    }

    // Paginação normal
    const page = Math.max(1, Number(url.searchParams.get("page") || DEFAULT_PAGE));
    const pageSizeRaw = Number(url.searchParams.get("pageSize") || DEFAULT_PAGE_SIZE);
    const pageSize = clamp(pageSizeRaw, MIN_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = (page - 1) * pageSize;

    if (offset > MAX_OFFSET) {
      const duration = Date.now() - startedAt;
      return NextResponse.json(
        {
          page,
          pageSize,
          total: MAX_OFFSET,
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

    if (idParam) {
      const idNum = Number(idParam);
      if (Number.isFinite(idNum)) {
        where.push("id = ?");
        params.push(idNum);
      }
    }
    if (type)   { where.push("type = ?"); params.push(type); }
    if (status) { where.push("status = ?"); params.push(status); }
    if (source) { where.push("source = ?"); params.push(source); }

    if (q) {
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

    const listSql = `
      /* recent-activities:list v2 (with at_token) */
      SELECT id, at_token, type, status, description, amount_cents, currency, source, ip, user_agent, icon_url, created_at
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

    const [rows] = await queryWithRetry<any[]>(listSql, [...params, pageSize, offset]);

    let total = 0;
    let estimate = false;
    try {
      const [countRows] = await queryWithRetry<any[]>(countSql, params);
      total = Number(countRows?.[0]?.total ?? 0);
      if (!Number.isFinite(total)) total = 0;
    } catch {
      total = offset + (rows?.length ?? 0) + ((rows?.length ?? 0) === pageSize ? 1 : 0);
      estimate = true;
    }

    const hasNextPage = offset + (rows?.length ?? 0) < total;

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

    if (err?.message === "Unauthorized") {
      return NextResponse.json(
        { error: "Unauthorized", meta: { requestId, durationMs: duration } },
        { status: 401, headers: baseHeaders }
      );
    }

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
