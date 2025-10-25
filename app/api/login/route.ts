import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import bcrypt from "bcryptjs";

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

function parseUserAgent(ua: string) {
  const u = ua.toLowerCase();
  let browser = "Desconhecido";
  let os = "Desconhecido";

  if (u.includes("chrome") && !u.includes("edg") && !u.includes("opr"))
    browser = "Google Chrome";
  else if (u.includes("edg"))
    browser = "Microsoft Edge";
  else if (u.includes("firefox"))
    browser = "Mozilla Firefox";
  else if (u.includes("safari") && !u.includes("chrome"))
    browser = "Safari";
  else if (u.includes("opr") || u.includes("opera"))
    browser = "Opera";

  if (u.includes("windows nt 10")) os = "Windows 10";
  else if (u.includes("windows nt 6.3")) os = "Windows 8.1";
  else if (u.includes("mac os x")) os = "macOS";
  else if (u.includes("android")) os = "Android";
  else if (u.includes("iphone") || u.includes("ipad")) os = "iOS";
  else if (u.includes("linux")) os = "Linux";

  return { browser, os };
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email) return NextResponse.json({ error: "Email é obrigatório" }, { status: 400 });

    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    const user = (rows as any)[0];
    if (!user) return NextResponse.json({ newUser: true });

    if (!password)
      return NextResponse.json({ error: "Senha obrigatória" }, { status: 400 });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return NextResponse.json({ error: "Email ou senha incorretos" }, { status: 401 });

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("fastly-client-ip") ||
      "0.0.0.0";

    const ua = req.headers.get("user-agent") || "Desconhecido";
    const { browser, os } = parseUserAgent(ua);

    let geo: any = {};
    try {
      const r = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 3000 });
      geo = r.data || {};
    } catch {
      geo = {};
    }

    const sessionId = uuidv4();
    const sessionToken = jwt.sign({ uid: user.id, sid: sessionId }, JWT_SECRET, { expiresIn: "24h" });
    const expireToken = jwt.sign({ uid: user.id, sid: sessionId }, JWT_SECRET, { expiresIn: "25h" });

    await db.query(
      `INSERT INTO logins (
        user_id, ip, browser, os, region, country, state, city,
        latitude, longitude, isp, timezone, cookie_session, cookie_expire
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        ip,
        browser,
        os,
        geo.region || "",
        geo.country_name || "",
        geo.region_code || "",
        geo.city || "",
        geo.latitude || 0,
        geo.longitude || 0,
        geo.org || "",
        geo.timezone || "",
        sessionToken,
        expireToken,
      ]
    );

    const res = NextResponse.json({
      success: true,
      redirect: "/dash",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    });

    const isProd = process.env.NODE_ENV === "production";
    const cookieOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax" as const,
      path: "/",
    };

    res.cookies.set("wzb_lg", sessionToken, { ...cookieOptions, maxAge: 86400 });
    res.cookies.set("wzb_lg_e", expireToken, { ...cookieOptions, maxAge: 90000 });

    return res;
  } catch (err: any) {
    console.error("[LOGIN ERROR]", err);
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
