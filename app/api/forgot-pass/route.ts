import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import nodemailer from "nodemailer";
import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { htmlMailTemplate } from "../html-mail/template";

dotenv.config();

const SMTP_USER = process.env.SMTP_USER!;
const SMTP_PASS = process.env.SMTP_PASS!;
const SMTP_HOST = process.env.SMTP_HOST || "smtp.hostinger.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;

if (!SMTP_USER || !SMTP_PASS) {
  throw new Error("❌ Variáveis SMTP_USER ou SMTP_PASS não definidas no .env");
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: true,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  tls: { rejectUnauthorized: false },
});

function generateOTP() {
  return randomInt(100000, 999999).toString();
}

function validatePasswordPolicy(pw: string): boolean {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/.test(pw);
}

function parseUserAgentFriendly(ua: string | null): string {
  if (!ua) return "Desconhecido";

  const u = ua.toLowerCase();
  let os = "Desconhecido";
  if (u.includes("windows")) os = "Windows";
  else if (u.includes("mac os x")) os = "macOS";
  else if (u.includes("android")) os = "Android";
  else if (u.includes("iphone") || u.includes("ipad")) os = "iOS";
  else if (u.includes("linux")) os = "Linux";

  let browser = "Desconhecido";
  if (u.includes("chrome") && !u.includes("edg") && !u.includes("opr")) browser = "Google Chrome";
  else if (u.includes("edg")) browser = "Microsoft Edge";
  else if (u.includes("firefox")) browser = "Mozilla Firefox";
  else if (u.includes("safari") && !u.includes("chrome")) browser = "Safari";
  else if (u.includes("opr") || u.includes("opera")) browser = "Opera";

  return `${browser} (${os})`;
}

export async function POST(req: NextRequest) {
  try {
    const { email, otp, password } = await req.json();

    const xf = req.headers.get("x-forwarded-for");
    const ip =
      (xf ? xf.split(",")[0].trim() : null) ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("fastly-client-ip") ||
      (req as any).ip ||
      "unknown";

    const userAgentRaw = req.headers.get("user-agent") || "";
    const friendlyBrowser = parseUserAgentFriendly(userAgentRaw);

    if (email && !otp && !password) {
      const [userRows] = await db.query(
        "SELECT id, name FROM users WHERE email=? LIMIT 1",
        [email]
      );
      const user = (userRows as any)[0];
      if (!user) {
        return NextResponse.json(
          { error: "Email não encontrado." },
          { status: 400 }
        );
      }

      const code = generateOTP();
      const expireAt = new Date(Date.now() + 10 * 60 * 1000);

      const [lastCodes] = await db.query(
        "SELECT id, status FROM forgot_pass_codes WHERE email=? ORDER BY created_at DESC LIMIT 1",
        [email]
      );
      const last = (lastCodes as any)[0];

      if (last && last.status === "pending") {
        await db.query(
          `UPDATE forgot_pass_codes
             SET otp=?, expires_at=?, status='pending'
           WHERE id=?`,
          [code, expireAt, last.id]
        );
      } else {
        await db.query(
          `INSERT INTO forgot_pass_codes (email, otp, expires_at, status)
           VALUES (?, ?, ?, 'pending')`,
          [email, code, expireAt]
        );
      }

      const emailBody = htmlMailTemplate
        .replace(/{{OTP}}/g, code)
        .replace(/{{NOME}}/g, user?.name || "Usuário")
        .replace(/{{IP}}/g, ip)
        .replace(/{{BROWSER}}/g, friendlyBrowser)
        .replace(/{{TITLE}}/g, "Redefinição de Senha")
        .replace(/{{DESC}}/g, "Use o código abaixo para continuar o processo de redefinição da sua senha Wyze Bank.");

      await transporter.sendMail({
        from: `"Wyze Bank" <${SMTP_USER}>`,
        to: email,
        subject: "Código de verificação - Redefinição de senha",
        html: emailBody,
      });

      return NextResponse.json({
        success: true,
        message: "Código enviado para seu email.",
      });
    }

    if (email && otp && !password) {
      const [rows] = await db.query(
        "SELECT * FROM forgot_pass_codes WHERE email=? ORDER BY created_at DESC LIMIT 1",
        [email]
      );
      const last = (rows as any)[0];

      if (!last) {
        return NextResponse.json(
          { error: "Nenhum código encontrado." },
          { status: 400 }
        );
      }

      if (last.status !== "pending") {
        return NextResponse.json(
          { error: "Código já utilizado ou bloqueado." },
          { status: 400 }
        );
      }

      if (new Date(last.expires_at) < new Date()) {
        return NextResponse.json(
          { error: "Código expirado." },
          { status: 400 }
        );
      }

      if (last.otp !== otp) {
        return NextResponse.json(
          { error: "Código incorreto." },
          { status: 400 }
        );
      }

      await db.query(
        "UPDATE forgot_pass_codes SET status='validated' WHERE id=?",
        [last.id]
      );

      return NextResponse.json({
        success: true,
        message: "Código validado. Agora informe a nova senha.",
      });
    }

    if (email && otp && password) {
      if (!validatePasswordPolicy(password)) {
        return NextResponse.json(
          {
            error:
              "Senha inválida. Use maiúscula, minúscula, número, símbolo e mínimo 8 caracteres.",
          },
          { status: 400 }
        );
      }

      const [rows] = await db.query(
        "SELECT * FROM forgot_pass_codes WHERE email=? ORDER BY created_at DESC LIMIT 1",
        [email]
      );
      const last = (rows as any)[0];

      if (
        !last ||
        last.status !== "validated" ||
        last.otp !== otp ||
        new Date(last.expires_at) < new Date()
      ) {
        return NextResponse.json(
          { error: "Código inválido ou expirado." },
          { status: 400 }
        );
      }

      const [userRows] = await db.query(
        "SELECT id, password_hash FROM users WHERE email=? LIMIT 1",
        [email]
      );
      const user = (userRows as any)[0];

      if (!user) {
        return NextResponse.json(
          { error: "Usuário não encontrado." },
          { status: 400 }
        );
      }

      const samePassword = await bcrypt.compare(password, user.password_hash);
      if (samePassword) {
        return NextResponse.json(
          { error: "A nova senha não pode ser igual à senha atual." },
          { status: 400 }
        );
      }

      const newHash = await bcrypt.hash(password, 10);
      await db.query(
        "UPDATE users SET password_hash=? WHERE email=? LIMIT 1",
        [newHash, email]
      );

      await db.query(
        "UPDATE forgot_pass_codes SET status='blocked' WHERE id=?",
        [last.id]
      );

      return NextResponse.json({
        success: true,
        message: "Senha atualizada com sucesso.",
        email,
      });
    }

    return NextResponse.json(
      { error: "Payload inválido." },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("[FORGOT-PASS ERROR]", err);
    return NextResponse.json(
      { error: err.message || "Erro interno." },
      { status: 500 }
    );
  }
}
