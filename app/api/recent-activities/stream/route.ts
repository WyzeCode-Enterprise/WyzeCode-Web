// app/api/recent-activities/stream/route.ts
import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { db } from "@/app/api/db";

export const runtime = "nodejs";

type JwtPayload = { uid: number };

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

export async function GET(req: NextRequest) {
  try {
    const userId = requireUserIdFromCookie(req);
    const url = new URL(req.url);

    const type = url.searchParams.get("type") || "";
    const status = url.searchParams.get("status") || "";
    const source = url.searchParams.get("source") || "";
    const q = (url.searchParams.get("q") || "").trim();
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const at = (url.searchParams.get("at") || "").trim(); // opcional
    const sinceMs = Number(url.searchParams.get("since") || Date.now());
    let lastSeen = new Date(sinceMs); // created_at > lastSeen

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();

        function send(ev: "message" | "heartbeat", data?: any) {
          const payload =
            ev === "heartbeat"
              ? `event: heartbeat\ndata: {}\n\n`
              : `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(enc.encode(payload));
        }

        let active = true;
        const interval = setInterval(() => {
          if (!active) return;
          send("heartbeat");
        }, 20000);

        async function tick() {
          if (!active) return;

          const where: string[] = [];
          const params: any[] = [];

          // quando há ?at=, não filtramos por lastSeen, para entregar sempre o registro alvo (se existir)
          if (at) {
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
          if (from)   { where.push("created_at >= ?"); params.push(`${from} 00:00:00`); }
          if (to)     { where.push("created_at <= ?"); params.push(`${to} 23:59:59`); }

          const whereSql = "WHERE " + where.join(" AND ");

          try {
            const [rows] = await db.query(
              `
              SELECT id, at_token, type, status, description, amount_cents, currency, source, ip, user_agent, icon_url, created_at
                FROM user_activity_log
                ${whereSql}
               ORDER BY created_at ASC
              `,
              params
            );

            const items = rows as any[];
            if (items.length) {
              for (const it of items) {
                send("message", it);
                const ts = new Date(it.created_at);
                if (!at && ts > lastSeen) lastSeen = ts;
              }
            }
          } catch {
            // mantém o stream vivo em silêncio
          }

          setTimeout(tick, 1500);
        }

        tick();

        const abort = req.signal;
        abort.addEventListener("abort", () => {
          active = false;
          clearInterval(interval);
          controller.close();
        });
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
    return new Response(
      `event: error\ndata: ${JSON.stringify({ error: err?.message || "Unauthorized" })}\n\n`,
      { status: err?.message === "Unauthorized" ? 401 : 500, headers: { "Content-Type": "text/event-stream" } }
    );
  }
}
