// lib/realtime/user-activity-watcher.ts
import { db } from "@/app/api/db";
import { onActivity } from "./activity-bus";

type Filters = {
  type?: string;
  status?: string;
  source?: string;
  q?: string;
  from?: string;
  to?: string;
};

type Subscriber = {
  send: (row: any) => void;
  filters: Filters;
};

class UserActivityWatcher {
  private userId: number;
  private subs = new Set<Subscriber>();
  private timer: NodeJS.Timeout | null = null;
  private lastId = 0;
  private busUnsub: (() => void) | null = null;

  constructor(userId: number) {
    this.userId = userId;
  }

  start() {
    if (this.timer) return;
    // 1) bus: eventos imediatos emitidos pela aplicação
    this.busUnsub = onActivity(this.userId, (row) => this.broadcast(row));
    // 2) poll de segurança (pega inserts externos, webhooks, etc.)
    this.timer = setInterval(() => {
      this.poll().catch(() => void 0);
    }, 2000); // ajuste se quiser mais agressivo
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.busUnsub) {
      this.busUnsub();
      this.busUnsub = null;
    }
  }

  add(sub: Subscriber) {
    this.subs.add(sub);
    if (this.subs.size === 1) this.start();
  }

  remove(sub: Subscriber) {
    this.subs.delete(sub);
    if (this.subs.size === 0) this.stop();
  }

  private matches(row: any, f: Filters) {
    if (f.type && row.type !== f.type) return false;
    if (f.status && row.status !== f.status) return false;
    if (f.source && row.source !== f.source) return false;
    if (f.q && !(row.description || "").toLowerCase().includes(f.q.toLowerCase())) return false;
    if (f.from && row.created_at < `${f.from} 00:00:00`) return false;
    if (f.to && row.created_at > `${f.to} 23:59:59`) return false;
    return true;
  }

  private broadcast(row: any) {
    for (const sub of this.subs) {
      if (this.matches(row, sub.filters)) {
        try { sub.send(row); } catch {}
      }
    }
  }

  // busca novas por id (assume AUTO_INCREMENT)
  private async poll() {
    const [rows] = await db.query(
      `SELECT id, user_id, type, status, description, amount_cents, currency, source, ip, user_agent, created_at
         FROM user_activity_log
        WHERE user_id = ? AND id > ?
        ORDER BY id ASC
        LIMIT 200`,
      [this.userId, this.lastId]
    );
    const list = rows as any[];
    for (const r of list) {
      if (r.id > this.lastId) this.lastId = r.id;
      this.broadcast(r);
    }
  }
}

const watchers = new Map<number, UserActivityWatcher>();

export function getUserWatcher(userId: number) {
  let w = watchers.get(userId);
  if (!w) {
    w = new UserActivityWatcher(userId);
    watchers.set(userId, w);
  }
  return w;
}
