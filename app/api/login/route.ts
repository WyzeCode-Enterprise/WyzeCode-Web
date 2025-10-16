import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email é obrigatório" }, { status: 400 });
    }

    // Buscar usuário no banco
    const [users] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    const user = (users as any)[0];

    // Se o email não existir → novo cadastro
    if (!user) {
      return NextResponse.json({ newUser: true });
    }

    // Caso já exista, prossegue com o login
    if (!password) {
      return NextResponse.json({ error: "Senha obrigatória" }, { status: 400 });
    }

    if (password !== user.password_hash) {
      return NextResponse.json({ error: "Email ou senha incorretos" }, { status: 401 });
    }

    // Gera tokens e salva login
    const sessionToken = jwt.sign({ uid: user.id, sid: uuidv4() }, JWT_SECRET, { expiresIn: "24h" });
    const expireToken = jwt.sign({ uid: user.id, sid: uuidv4() }, JWT_SECRET, { expiresIn: "25h" });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "0.0.0.0";
    const userAgent = req.headers.get("user-agent") || "";

    let geo: any = {};
    try {
      const response = await axios.get(`https://ipapi.co/${ip}/json/`);
      geo = response.data || {};
    } catch {
      geo = {};
    }

    await db.query(
      `INSERT INTO logins (user_id, ip, browser, os, region, country, state, city, latitude, longitude, cookie_session, cookie_expire)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        ip,
        userAgent,
        userAgent,
        geo.region || "",
        geo.country_name || "",
        geo.region_code || "",
        geo.city || "",
        geo.latitude || 0,
        geo.longitude || 0,
        sessionToken,
        expireToken,
      ]
    );

    const res = NextResponse.json({ success: true, redirect: "/dash" });
    res.cookies.set("wzb_lg", sessionToken, { httpOnly: true, path: "/", maxAge: 86400 });
    res.cookies.set("wzb_lg_e", expireToken, { httpOnly: true, path: "/", maxAge: 90000 });

    return res;
  } catch (err) {
    console.error("Erro interno na API login:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
