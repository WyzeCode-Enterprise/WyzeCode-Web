import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import nodemailer from "nodemailer";
import { randomInt } from "crypto";
import { htmlMailTemplate } from "../html-mail/template";
import dotenv from "dotenv";

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

function friendlyBrowser(ua?: string) {
  if (!ua) return "Desconhecido";
  const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
  const browser =
    /Edg\//.test(ua) ? "Edge" :
      /Chrome\//.test(ua) ? "Chrome" :
        /Safari\//.test(ua) && !/Chrome\//.test(ua) ? "Safari" :
          /Firefox\//.test(ua) ? "Firefox" :
            /OPR\//.test(ua) ? "Opera" : "Navegador";
  return `${browser}${isMobile ? " (mobile)" : ""}`;
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email)
      return NextResponse.json({ error: "Email é obrigatório" }, { status: 400 });

    const [existing] = await db.query(
      "SELECT * FROM otp_codes WHERE email=? ORDER BY created_at DESC LIMIT 1",
      [email]
    );
    const lastOtp = (existing as any)[0];
    if (!lastOtp)
      return NextResponse.json({ error: "Nenhum OTP encontrado para este email" }, { status: 400 });

    const otp = generateOTP();
    const expireAt = new Date(Date.now() + 10 * 60 * 1000);
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "0.0.0.0";
    const userAgent = req.headers.get("user-agent") || "";

    await db.query(
      `UPDATE otp_codes SET otp=?, expires_at=? WHERE id=?`,
      [otp, expireAt, lastOtp.id]
    );

    const emailBody = htmlMailTemplate
      .replace(/{{OTP}}/g, otp)
      .replace(/{{NOME}}/g, lastOtp?.nome || "Cliente Wyze")
      .replace(/{{IP}}/g, ip)
      .replace(/{{BROWSER}}/g, friendlyBrowser(userAgent));

    await transporter.sendMail({
      from: `"Wyze Bank" <${SMTP_USER}>`,
      to: email,
      subject: "Seu código de verificação - Wyze Bank",
      html: emailBody,
    });

    return NextResponse.json({
      success: true,
      message: "Código reenviado com sucesso.",
    });
  } catch (err: any) {
    console.error("[RESEND OTP ERROR]", err);
    return NextResponse.json(
      { error: err.message || "Erro ao reenviar OTP" },
      { status: 500 }
    );
  }
}
