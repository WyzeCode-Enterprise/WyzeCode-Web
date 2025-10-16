import { NextRequest, NextResponse } from "next/server";
import { db } from "./db";

// Endpoint para verificar OTP e cadastrar usuário
export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();
    if (!email || !otp) {
      return NextResponse.json({ error: "Email e OTP são obrigatórios." }, { status: 400 });
    }

    // Busca OTP pendente
    const [rows] = await db.query(
      "SELECT * FROM otp_codes WHERE email = ? AND otp = ? AND status = 'pending' AND expires_at > NOW()",
      [email, otp]
    );

    if ((rows as any).length === 0) {
      return NextResponse.json({ error: "Código inválido ou expirado." }, { status: 400 });
    }

    const otpRecord = (rows as any)[0];

    // Insere usuário na tabela users
    await db.query(
      `INSERT INTO users (email, password_hash, created_at, name, phone, cpf_or_cnpj)
       VALUES (?, ?, NOW(), ?, ?, ?)`,
      [otpRecord.email, otpRecord.password_hash, otpRecord.nome, otpRecord.telefone, otpRecord.cpf_cnpj]
    );

    // Atualiza OTP para approved
    await db.query(
      "UPDATE otp_codes SET status = 'approved' WHERE id = ?",
      [otpRecord.id]
    );

    return NextResponse.json({ success: true, message: "Conta cadastrada com sucesso!" });

  } catch (err: any) {
    console.error("[OTP VERIFY ERROR]", err);
    return NextResponse.json({ error: err.message || "Erro ao verificar OTP." }, { status: 500 });
  }
}
