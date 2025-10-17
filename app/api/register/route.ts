import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

import nodemailer from "nodemailer";
import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
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

// --- utilidades (validações + helpers) ---
// Lista de DDDs válidos no Brasil
const validDDDs = [
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46",
  "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99"
];

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? "+" + digits : "+55" + digits;
}

async function isValidPhone(phone: string) {
  const normalized = normalizePhone(phone);
  const brRegex = /^\+55\d{2}9\d{8}$/;
  if (!brRegex.test(normalized)) return false;
  const digits = normalized.replace(/\D/g, "");
  const ddd = digits.slice(2, 4);
  const number = digits.slice(4);
  if (!validDDDs.includes(ddd)) return false;
  if (number.length !== 9 || !number.startsWith("9")) return false;
  return true;
}

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

// Parse simplificado do user-agent para exibir algo "bonito" no e-mail.
// Observação: isso é heurístico e não substitui uma lib dedicada (ex: ua-parser).
function parseUserAgentFriendly(ua: string | null): string {
  if (!ua) return "Desconhecido";
  const u = ua.toLowerCase();

  // SO
  let os = "Desconhecido";
  if (u.includes("windows nt 10")) os = "Windows 10";
  else if (u.includes("windows nt 6.3") || u.includes("windows nt 6.2")) os = "Windows";
  else if (u.includes("mac os x")) os = "macOS";
  else if (u.includes("android")) os = "Android";
  else if (u.includes("iphone") || u.includes("ipad")) os = "iOS";
  else if (u.includes("linux")) os = "Linux";

  // Navegador
  let browser = "Desconhecido";
  if (u.includes("chrome") && !u.includes("edg") && !u.includes("opr") && !u.includes("chromium")) browser = "Google Chrome";
  else if (u.includes("edg") || u.includes("edge")) browser = "Microsoft Edge";
  else if (u.includes("firefox")) browser = "Mozilla Firefox";
  else if (u.includes("safari") && !u.includes("chrome")) browser = "Safari";
  else if (u.includes("opr") || u.includes("opera")) browser = "Opera";

  return `${browser} (${os})`;
}

// --- rota POST ---
export async function POST(req: NextRequest) {
  try {
    const { email, nome, telefone, cpfCnpj, password, otp: otpUser } = await req.json();

    if (!email || !nome || !telefone || !cpfCnpj || !password) {
      return NextResponse.json({ error: "Todos os campos são obrigatórios." }, { status: 400 });
    }

    // captura IP robusta (X-Forwarded-For, CF, etc.)
    const xf = req.headers.get("x-forwarded-for");
    const ip = xf ? xf.split(",")[0].trim() :
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("fastly-client-ip") ||
      (req as any).ip || // fallback, pode não existir
      "unknown";

    // captura user-agent completo (salvaremos inteiro no banco)
    const userAgent = req.headers.get("user-agent") || "";

    // prepara string amigável para o email (somente para exibição)
    const friendlyBrowser = parseUserAgentFriendly(userAgent);

    // Valida telefone (IMPORTANTE: await!)
    const phoneOk = await isValidPhone(telefone);
    if (!phoneOk) {
      return NextResponse.json({ error: "Número de Telefone inválido. (ex: +55 11 99999-9999)" }, { status: 400 });
    }

    // Validação CPF/CNPJ
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
        return NextResponse.json({ error: "CNPJ inválido ou não confere com o nome informado." }, { status: 400 });
      }
    }

    // valida senha
    if (!isValidPassword(password)) {
      return NextResponse.json({
        error: "Senha inválida. Deve conter letra maiúscula, minúscula, número, caractere especial e mínimo 8 caracteres."
      }, { status: 400 });
    }

    // busca último OTP
    const [existing] = await db.query(
      "SELECT * FROM otp_codes WHERE email=? ORDER BY created_at DESC LIMIT 1",
      [email]
    );
    const lastOtp = (existing as any)[0];

    // ramo: sem otp recebido -> gerar e enviar
    if (!otpUser) {
      const otp = generateOTP();
      const expireAt = new Date(Date.now() + 10 * 60 * 1000);
      const normalizedPhone = normalizePhone(telefone);
      const hashedPassword = await bcrypt.hash(password, 10);
      const hashedCpfCnpj = await bcrypt.hash(cpfCnpj, 10);

      if (lastOtp && lastOtp.status === "pending") {
        // atualiza registro existente — adiciona ip e user_agent (salva o user-agent completo)
        await db.query(
          `UPDATE otp_codes SET otp=?, expires_at=?, nome=?, telefone=?, cpf_cnpj=?, password_hash=?, ip=?, user_agent=? WHERE id=?`,
          [otp, expireAt, nome, normalizedPhone, hashedCpfCnpj, hashedPassword, ip, userAgent, lastOtp.id]
        );
      } else {
        // insere novo registro — inclui ip e user_agent
        await db.query(
          `INSERT INTO otp_codes (email, nome, telefone, cpf_cnpj, password_hash, otp, expires_at, status, ip, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
          [email, nome, normalizedPhone, hashedCpfCnpj, hashedPassword, otp, expireAt, ip, userAgent]
        );
      }

// lê HTML externo
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const templatePath = path.join(__dirname, "index.html");
const template = await readFile(templatePath, "utf-8");

// substitui variáveis
const emailBody = template
  .replace(/{{OTP}}/g, otp)
  .replace(/{{NOME}}/g, nome)
  .replace(/{{IP}}/g, ip)
  .replace(/{{BROWSER}}/g, friendlyBrowser);

await transporter.sendMail({
  from: `"Wyze Bank" <${SMTP_USER}>`,
  to: email,
  subject: "Seu código de verificação - Wyze Bank",
  html: emailBody,
});


      return NextResponse.json({ success: true, message: "Código enviado para seu email." });
    }

    // --- ramo: validação do OTP recebido pelo usuário ---
    if (!lastOtp) return NextResponse.json({ error: "Nenhum OTP encontrado." }, { status: 400 });
    if (lastOtp.status !== "pending") return NextResponse.json({ error: "OTP já utilizado." }, { status: 400 });
    if (new Date(lastOtp.expires_at) < new Date()) return NextResponse.json({ error: "OTP expirado." }, { status: 400 });
    if (lastOtp.otp !== otpUser) return NextResponse.json({ error: "Código incorreto." }, { status: 400 });

    // marcar validado
    await db.query(`UPDATE otp_codes SET status='validated' WHERE id=?`, [lastOtp.id]);

    // criar usuário (salva telefone normalizado)
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
