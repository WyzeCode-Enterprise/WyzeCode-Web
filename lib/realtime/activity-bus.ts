// lib/realtime/activity-bus.ts
import { EventEmitter } from "events";

type ActivityRow = {
  id: number;
  user_id: number;
  type: string;
  status: string;
  description: string | null;
  amount_cents: number | null;
  currency: string | null;
  source: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

const emitter = new EventEmitter();

// envia evento p/ um usuário específico
export function emitActivity(userId: number, row: ActivityRow) {
  emitter.emit(`activity:${userId}`, row);
}

// registra listener p/ um usuário
export function onActivity(userId: number, fn: (row: ActivityRow) => void) {
  const evt = `activity:${userId}`;
  emitter.on(evt, fn);
  return () => emitter.off(evt, fn);
}
