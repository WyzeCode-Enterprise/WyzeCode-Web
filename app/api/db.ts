// app/api/db.ts
import mysql, { Pool } from "mysql2/promise";

declare global {
  // eslint-disable-next-line no-var
  var __WZB_DB__: Pool | undefined;
}

function createPool(): Pool {
  return mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 3306,
    connectTimeout: 10_000,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONN_LIMIT) || 10,
    queueLimit: 0, // fila ilimitada no driver; a gente controla via guard
  });
}

export const db: Pool = globalThis.__WZB_DB__ ?? createPool();
if (!globalThis.__WZB_DB__) globalThis.__WZB_DB__ = db;
