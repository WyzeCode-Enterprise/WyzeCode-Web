import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import nodemailer from "nodemailer";
import { randomInt } from "crypto";

const SMTP_USER = "auth@wyzebank.com";
const SMTP_PASS = "@Mm4839107265";

const transporter = nodemailer.createTransport({
  host: "smtp.hostinger.com",
  port: 465,
  secure: true,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  tls: { rejectUnauthorized: false },
});

function generateOTP() {
  return randomInt(100000, 999999).toString();
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email é obrigatório" }, { status: 400 });

    const [existing] = await db.query(
      "SELECT * FROM otp_codes WHERE email=? ORDER BY created_at DESC LIMIT 1",
      [email]
    );
    const lastOtp = (existing as any)[0];
    if (!lastOtp) return NextResponse.json({ error: "Nenhum OTP encontrado para este email" }, { status: 400 });

    const otp = generateOTP();
    const expireAt = new Date(Date.now() + 10 * 60 * 1000);

    // Atualiza OTP pendente
    await db.query(
      `UPDATE otp_codes SET otp=?, expires_at=? WHERE id=?`,
      [otp, expireAt, lastOtp.id]
    );

    await transporter.sendMail({
      from: `"Wyze Bank" <${SMTP_USER}>`,
      to: email,
      subject: "Seu código de verificação Wyze Bank",
      html: `<p>Seu código de verificação foi reenviado:</p><h2>${otp}</h2><p>Expira em 10 minutos.</p>`,
    });

    return NextResponse.json({ success: true, message: "Código reenviado com sucesso." });
  } catch (err: any) {
    console.error("[RESEND OTP ERROR]", err);
    return NextResponse.json({ error: err.message || "Erro ao reenviar OTP" }, { status: 500 });
  }
}
