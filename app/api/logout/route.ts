import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

/**
 * Faz logout com registro detalhado no banco.
 * - Invalida cookies.
 * - Marca o horário e dados de logout na tabela `logins`.
 */
export async function GET(req: NextRequest) {
  try {
    const origin = req.nextUrl.origin;
    const res = NextResponse.redirect(`${origin}/login`);

    // Lê tokens atuais
    const token = req.cookies.get("wzb_lg")?.value;
    const tokenExpire = req.cookies.get("wzb_lg_e")?.value;

    // Captura dados de contexto
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("fastly-client-ip") ||
      "0.0.0.0";
    const userAgent = req.headers.get("user-agent") || "Desconhecido";

    // Remove cookies
    res.cookies.set("wzb_lg", "", { path: "/", maxAge: 0 });
    res.cookies.set("wzb_lg_e", "", { path: "/", maxAge: 0 });

    // Tenta decodificar o JWT para identificar o usuário
    let decoded: any = null;
    try {
      decoded = jwt.verify(token || "", JWT_SECRET);
    } catch {
      decoded = null;
    }

    // Se conseguir identificar o usuário, registra o logout no BD
    if (decoded && decoded.uid) {
      await db.query(
        `UPDATE logins 
         SET logout_at = NOW(), 
             logout_ip = ?, 
             logout_agent = ?, 
             session_status = 'closed' 
         WHERE user_id = ? 
           AND cookie_session = ? 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [ip, userAgent, decoded.uid, token]
      );
    } else {
      // Caso o token não seja válido, ainda registramos o logout genérico
      await db.query(
        `INSERT INTO logins_logout_events (ip, user_agent, reason, created_at)
         VALUES (?, ?, ?, NOW())`,
        [ip, userAgent, "Logout sem token válido"]
      );
    }

    return res;
  } catch (err) {
    console.error("[LOGOUT ERROR]", err);
    return NextResponse.json({ error: "Erro ao processar logout" }, { status: 500 });
  }
}
