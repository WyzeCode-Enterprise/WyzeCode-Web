import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { randomInt } from "crypto";
import { db } from "../db";

// SMTP
const SMTP_USER = "auth@wyzebank.com";
const SMTP_PASS = "@Mm4839107265";

const transporter = nodemailer.createTransport({
  host: "smtp.hostinger.com",
  port: 465,
  secure: true,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  tls: { rejectUnauthorized: false },
});

// Lista de DDDs válidos no Brasil
const validDDDs = [
  "11","12","13","14","15","16","17","18","19",
  "21","22","24","27","28",
  "31","32","33","34","35","37","38",
  "41","42","43","44","45","46",
  "47","48","49",
  "51","53","54","55",
  "61","62","63","64","65","66","67","68","69",
  "71","73","74","75","77","79",
  "81","82","83","84","85","86","87","88","89",
  "91","92","93","94","95","96","97","98","99"
];

// Normaliza para E.164 (+5511999999999)
function normalizePhone(phone: string): string {
  return "+" + phone.replace(/\D/g, "");
}

async function isValidPhone(phone: string) {
  // Normaliza e valida formato internacional
  const normalized = normalizePhone(phone);
  const e164Regex = /^\+[1-9]\d{7,14}$/; // E.164
  if (!e164Regex.test(normalized)) return false;

  // Extrai partes (Brasil: +55)
  const digits = normalized.replace(/\D/g, "");
  const countryCode = digits.slice(0, 2);
  const ddd = digits.slice(2, 4);
  const number = digits.slice(4);

  // País deve ser Brasil
  if (countryCode !== "55") return false;

  // DDD válido
  if (!validDDDs.includes(ddd)) return false;

  // Número deve ter 9 dígitos e começar com 9 (celular)
  if (number.length !== 9 || !number.startsWith("9")) return false;

  // Consulta HLR (se ativo mesmo) com timeout e fallback
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(
      `https://sms.witi.me/izdata/hlr.aspx?chave=${process.env.WITI_KEY}&telefone=${digits}`,
      { signal: controller.signal }
    );
    clearTimeout(t);

    if (!resp.ok) {
      // Se a API retornar erro, não quebra; usa validação local
      return true;
    }

    const data = await resp.json();
    // Alguns provedores retornam strings "true"/"false"
    const valido = data?.Telefones?.[0]?.Valido;
    if (typeof valido === "string") {
      return valido.toLowerCase() === "true";
    }
    return valido === true;
  } catch (err) {
    console.error("HLR API error:", err);
    // fallback: aceita se passou todas as validações locais
    return true;
  }
}

// CPF ↔ Nome (com fallback estrutural se não houver chave)
async function validateCPFWithName(cpf: string, nome: string) {
  const digits = cpf.replace(/\D/g, "");

  if (!process.env.CPF_API_KEY) {
    return isValidCPF(digits);
  }

  const resp = await fetch(`https://api.cpfhub.io/v1/cpf/${digits}`, {
    headers: { "x-api-key": process.env.CPF_API_KEY }
  });

  if (!resp.ok) return false;

  const data = await resp.json();
  if (!data?.nome) return false;

  const nomeInformado = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const nomeOficial = data.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  return nomeOficial.includes(nomeInformado);
}

// CNPJ ↔ Razão Social
async function validateCNPJWithName(cnpj: string, razao: string) {
  const digits = cnpj.replace(/\D/g, "");
  const resp = await fetch(`https://publica.cnpj.ws/cnpj/${digits}`);
  if (!resp.ok) return false;

  const data = await resp.json();
  if (!data?.razao_social) return false;
  return data.razao_social.toLowerCase().includes(razao.toLowerCase());
}

function isValidCPF(cpf: string): boolean {
  cpf = cpf.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev >= 10) rev = 0;
  if (rev !== parseInt(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev >= 10) rev = 0;
  return rev === parseInt(cpf[10]);
}

function isValidCNPJ(cnpj: string): boolean {
  cnpj = cnpj.replace(/\D/g, "");
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const t = cnpj.length - 2;
  const d = cnpj.substring(t);
  const d1 = parseInt(d[0]);
  const d2 = parseInt(d[1]);
  const calc = (x: number) => {
    let n = 0, pos = x - 7;
    for (let i = x; i >= 1; i--) {
      n += parseInt(cnpj[x - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    return ((n % 11) < 2 ? 0 : 11 - (n % 11));
  };
  return calc(12) === d1 && calc(13) === d2;
}

function isValidPassword(pw: string): boolean {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/.test(pw);
}

function generateOTP() {
  return randomInt(100000, 999999).toString();
}

// POST
export async function POST(req: NextRequest) {
  try {
    const { email, nome, telefone, cpfCnpj, password, otp: otpUser } = await req.json();

    // Campos obrigatórios
    if (!email || !nome || !telefone || !cpfCnpj || !password) {
      return NextResponse.json({ error: "Todos os campos são obrigatórios." }, { status: 400 });
    }

    // Valida telefone (IMPORTANTE: await!)
    const phoneOk = await isValidPhone(telefone);
    if (!phoneOk) {
      return NextResponse.json({ error: "Telefone inválido. Use +55 DDD 9XXXX-XXXX com DDD válido." }, { status: 400 });
    }

    // Valida CPF/CNPJ
    if (cpfCnpj.replace(/\D/g, "").length <= 11) {
      if (!isValidCPF(cpfCnpj)) {
        return NextResponse.json({ error: "CPF inválido." }, { status: 400 });
      }
      const cpfOk = await validateCPFWithName(cpfCnpj, nome);
      if (!cpfOk) {
        return NextResponse.json({ error: "CPF não confere com o nome informado." }, { status: 400 });
      }
    } else {
      if (!isValidCNPJ(cpfCnpj)) {
        return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
      }
      const cnpjOk = await validateCNPJWithName(cpfCnpj, nome);
      if (!cnpjOk) {
        return NextResponse.json({ error: "CNPJ não confere com a razão social informada." }, { status: 400 });
      }
    }

    // Valida senha
    if (!isValidPassword(password)) {
      return NextResponse.json({
        error: "Senha inválida. Deve conter letra maiúscula, minúscula, número, caractere especial e mínimo 8 caracteres."
      }, { status: 400 });
    }

    // Busca último OTP
    const [existing] = await db.query(
      "SELECT * FROM otp_codes WHERE email=? ORDER BY created_at DESC LIMIT 1",
      [email]
    );
    const lastOtp = (existing as any)[0];

    // Sem OTP: gerar/enviar
    if (!otpUser) {
      const otp = generateOTP();
      const expireAt = new Date(Date.now() + 10 * 60 * 1000);

      const normalizedPhone = normalizePhone(telefone);

      if (lastOtp && lastOtp.status === "pending") {
        await db.query(
          `UPDATE otp_codes SET otp=?, expires_at=?, nome=?, telefone=?, cpf_cnpj=?, password_hash=? WHERE id=?`,
          [otp, expireAt, nome, normalizedPhone, cpfCnpj, password, lastOtp.id]
        );
      } else {
        await db.query(
          `INSERT INTO otp_codes (email, nome, telefone, cpf_cnpj, password_hash, otp, expires_at, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [email, nome, normalizedPhone, cpfCnpj, password, otp, expireAt]
        );
      }

      await transporter.sendMail({
        from: `"Wyze Bank" <${SMTP_USER}>`,
        to: email,
        subject: "Seu código de verificação Wyze Bank",
        html: `<p>Olá ${nome},</p><p>Seu código é:</p><h2>${otp}</h2><p>Expira em 10 minutos.</p>`,
      });

      return NextResponse.json({ success: true, message: "Código enviado para seu email." });
    }

    // Validar OTP
    if (!lastOtp) return NextResponse.json({ error: "Nenhum OTP encontrado." }, { status: 400 });
    if (lastOtp.status !== "pending") return NextResponse.json({ error: "OTP já utilizado." }, { status: 400 });
    if (new Date(lastOtp.expires_at) < new Date()) return NextResponse.json({ error: "OTP expirado." }, { status: 400 });
    if (lastOtp.otp !== otpUser) return NextResponse.json({ error: "Código incorreto." }, { status: 400 });

    // Marcar OTP como validado
    await db.query(`UPDATE otp_codes SET status='validated' WHERE id=?`, [lastOtp.id]);

    // Criar usuário (salva telefone normalizado)
    await db.query(
      `INSERT INTO users (email, password_hash, created_at, name, phone, cpf_or_cnpj)
       VALUES (?, ?, NOW(), ?, ?, ?)`,
      [lastOtp.email, lastOtp.password_hash, lastOtp.nome, normalizePhone(lastOtp.telefone), lastOtp.cpf_cnpj]
    );

    return NextResponse.json({
      success: true,
      message: "Conta criada com sucesso",
      redirect: "/login",
      email: lastOtp.email
    });

  } catch (err: any) {
    console.error("[REGISTER ERROR]", err);
    return NextResponse.json({ error: err.message || "Erro ao registrar" }, { status: 500 });
  }
}