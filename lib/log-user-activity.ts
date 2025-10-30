// lib/log-user-activity.ts
import { db } from "@/app/api/db";
import { emitActivity } from "@/lib/realtime/activity-bus";

type Insert = {
  user_id: number;
  type: string;
  status: string;
  description?: string | null;
  amount_cents?: number | null;
  currency?: string | null;
  source?: string | null;
  ip?: string | null;
  user_agent?: string | null;
};

export async function logUserActivity(data: Insert) {
  const {
    user_id, type, status,
    description = null, amount_cents = null, currency = null,
    source = null, ip = null, user_agent = null
  } = data;

  const [res]: any = await db.query(
    `INSERT INTO user_activity_log
     (user_id, type, status, description, amount_cents, currency, source, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [user_id, type, status, description, amount_cents, currency, source, ip, user_agent]
  );

  const [rows] = await db.query(
    `SELECT id, user_id, type, status, description, amount_cents, currency, source, ip, user_agent, created_at
       FROM user_activity_log WHERE id = ? LIMIT 1`,
    [res.insertId]
  );

  const row = (rows as any[])[0];
  // push imediato para assinantes do usuário
  emitActivity(user_id, row);

  return row;
}
