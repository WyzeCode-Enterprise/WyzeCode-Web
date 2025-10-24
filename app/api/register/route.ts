import { NextRequest, NextResponse } from "next/server";
import { htmlMailTemplate } from "../html-mail/template";
import nodemailer from "nodemailer";
import { randomInt, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../db";
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
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
];


async function fetchJSONWithTimeout(url: string, opts?: { timeoutMs?: number; retries?: number; init?: RequestInit }) {
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const retries = opts?.retries ?? 1;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { ...(opts?.init || {}), signal: ctrl.signal, cache: "no-store" });
      const data = await resp.json().catch(() => ({}));
      return { ok: resp.ok, data, status: resp.status };
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
    } finally {
      clearTimeout(to);
    }
  }
  return { ok: false, data: null, status: 0 };
}

const HUBDEV_TOKEN = process.env.HUBDEV_TOKEN || "188447075BqtvRFdAeC340235480";
const HUBDEV_BASE = "https://ws.hubdodesenvolvedor.com.br/v2/cpf/";

function normalizeNameStrict(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

function namesEqual(a: string, b: string): boolean { return normalizeNameStrict(a) === normalizeNameStrict(b); }

function parsePtBrDate(dmy: string): Date | null {
  const m = dmy?.match?.(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

function ageFrom(birth: Date, ref: Date = new Date()): number {
  const y = ref.getUTCFullYear() - birth.getUTCFullYear();
  const m = ref.getUTCMonth() - birth.getUTCMonth();
  const d = ref.getUTCDate() - birth.getUTCDate();
  return m > 0 || (m === 0 && d >= 0) ? y : y - 1;
}

async function hubDevCpfLookup(cpf: string, birthPtBr?: string, extra: Record<string, string> = {}) {
  const digits = cpf.replace(/\D/g, "");
  const params = new URLSearchParams({ cpf: digits, token: HUBDEV_TOKEN, ...extra });
  if (birthPtBr) params.set("data", birthPtBr);
  const url = `${HUBDEV_BASE}?${params.toString()}`;

  const { ok, data } = await fetchJSONWithTimeout(url, { timeoutMs: 25000, retries: 1 });
  if (!ok || !data || data.return !== "OK" || data.status !== true) {
    const msg = typeof data?.message === "string" ? data.message : "Consulta não retornou OK.";
    const err: any = new Error(msg);
    err.code = "HUBDEV_NOK";
    err.raw = data;
    throw err;
  }
  return data;
}

async function cpfHubLookup(cpf: string) {
  const key = process.env.CPF_API_KEY as string | undefined;
  if (!key) return null;
  const digits = cpf.replace(/\D/g, "");
  const url = `https://api.cpfhub.io/v1/cpf/${digits}`;
  const { ok, data } = await fetchJSONWithTimeout(url, { timeoutMs: 20000, retries: 1, init: { headers: { "x-api-key": key } } });
  if (!ok || !data) return null;
  const nome = data?.nome;
  const birthRaw = data?.data_nascimento || data?.nascimento || data?.birthdate || data?.dataNascimento;
  let birth: Date | null = null;
  if (typeof birthRaw === "string") {
    const iso = birthRaw.match?.(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
      if (!isNaN(d.getTime())) birth = d;
    } else {
      birth = parsePtBrDate(birthRaw);
    }
  }
  return { nome, birth };
}

type PFCheckFail =
  | "UNDERAGE"
  | "NAME_MISMATCH"
  | "NO_DATA"
  | "SERVICE_UNAVAILABLE"
  | "NEEDS_BIRTH";

async function validatePF_Strict(cpf: string, nomeInformado: string): Promise<
  | { ok: true }
  | { ok: false; reason: PFCheckFail; detail?: string }
> {
  try {
    const hub = await hubDevCpfLookup(cpf);
    const result = hub?.result || {};
    const nomeOficial = result?.nome_da_pf as string | undefined;
    const nascimentoStr = result?.data_nascimento as string | undefined;

    if (!nomeOficial || !nascimentoStr) {
      throw Object.assign(new Error("Sem nome/data no HubDev"), { code: "HUBDEV_NO_DATA" });
    }
    if (!namesEqual(nomeInformado, nomeOficial)) {
      return { ok: false, reason: "NAME_MISMATCH", detail: "Nome não confere com o CPF." };
    }
    const birth = parsePtBrDate(nascimentoStr);
    if (!birth) {
      throw Object.assign(new Error("Data inválida no HubDev"), { code: "HUBDEV_BAD_BIRTH" });
    }
    if (ageFrom(birth) < 18) return { ok: false, reason: "UNDERAGE" };
    return { ok: true };

  } catch (e: any) {
    const msg = (e?.message || "").toString();

    const needsBirth = /Data de Nascimento n[oã]o informada/i.test(msg) || e?.code === "HUBDEV_NO_DATA" || e?.code === "HUBDEV_BAD_BIRTH";
    if (needsBirth) {
      const fb = await cpfHubLookup(cpf);
      if (fb && fb.nome && fb.birth) {
        if (!namesEqual(nomeInformado, fb.nome)) {
          return { ok: false, reason: "NAME_MISMATCH", detail: "Nome não confere com o CPF." };
        }
        if (ageFrom(fb.birth) < 18) {
          return { ok: false, reason: "UNDERAGE" };
        }
        return { ok: true };
      }
      return { ok: false, reason: "NEEDS_BIRTH", detail: "Fonte oficial exigiu data e não foi possível obter via fallback." };
    }

    return { ok: false, reason: "SERVICE_UNAVAILABLE", detail: msg };
  }
}




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
  if (!process.env.CPF_API_KEY) return isValidCPF(digits);
  const resp = await fetch(`https://api.cpfhub.io/v1/cpf/${digits}`, {
    headers: { "x-api-key": process.env.CPF_API_KEY as string },
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
    return (n % 11) < 2 ? 0 : 11 - (n % 11);
  };
  return calc(12) === d1 && calc(13) === d2;
}

function isValidPassword(pw: string): boolean {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/.test(pw);
}

function generateOTP() {
  return randomInt(100000, 999999).toString();
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

function cpfCnpjFingerprint(cpfCnpjRaw: string): string {
  const pepper = process.env.CPF_CNPJ_PEPPER || "wyze_default_pepper_change_me";
  const digits = cpfCnpjRaw.replace(/\D/g, "");
  const h = createHash("sha256");
  h.update(pepper + digits);
  return h.digest("hex");
}

async function assertUniqueIdentity(phoneRaw: string, cpfCnpjRaw: string, withBcryptFallback = false) {
  const normalizedPhone = normalizePhone(phoneRaw);
  const fingerprint = cpfCnpjFingerprint(cpfCnpjRaw);

  const [samePhone] = await db.query(
    "SELECT id FROM users WHERE phone=? LIMIT 1",
    [normalizedPhone]
  );
  if ((samePhone as any).length > 0) {
    throw new Error("Este número de telefone já está cadastrado.");
  }

  const [sameDocFast] = await db.query(
    "SELECT id FROM users WHERE cpf_cnpj_fingerprint=? LIMIT 1",
    [fingerprint]
  );
  if ((sameDocFast as any).length > 0) {
    throw new Error("Este CPF/CNPJ já está cadastrado.");
  }

  if (withBcryptFallback) {
    const digits = cpfCnpjRaw.replace(/\D/g, "");
    const [rows] = await db.query("SELECT id, cpf_or_cnpj FROM users");
    for (const r of rows as any[]) {
      if (r?.cpf_or_cnpj && await bcrypt.compare(digits, r.cpf_or_cnpj)) {
        throw new Error("Este CPF/CNPJ já está cadastrado.");
      }
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email, nome, telefone, cpfCnpj, password, otp: otpUser } = await req.json();

    if (!email || !nome || !telefone || !cpfCnpj || !password) {
      return NextResponse.json({ error: "Todos os campos são obrigatórios." }, { status: 400 });
    }

    const xf = req.headers.get("x-forwarded-for");
    const ip = xf ? xf.split(",")[0].trim()
      : req.headers.get("cf-connecting-ip")
      || req.headers.get("fastly-client-ip")
      || (req as any).ip
      || "unknown";

    const userAgent = req.headers.get("user-agent") || "";
    const friendlyBrowser = parseUserAgentFriendly(userAgent);

    const phoneOk = await isValidPhone(telefone);
    if (!phoneOk) {
      return NextResponse.json({ error: "Número de Telefone inválido. (ex: +55 11 99999-9999)" }, { status: 400 });
    }

    try {
      await assertUniqueIdentity(telefone, cpfCnpj);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    if (cpfCnpj.replace(/\D/g, "").length <= 11) {
      if (!isValidCPF(cpfCnpj)) {
        return NextResponse.json({ error: "CPF inválido." }, { status: 400 });
      }

      const pf = await validatePF_Strict(cpfCnpj, nome);

      if (!pf.ok) {
        switch (pf.reason) {
          case "UNDERAGE":
            return NextResponse.json({ error: "Você deve possuir +18 para continuar." }, { status: 400 });
          case "NAME_MISMATCH":
            return NextResponse.json({ error: "CPF não confere com o nome informado." }, { status: 400 });
          case "NEEDS_BIRTH":
            return NextResponse.json({
              error: "Você deve possuir +18 anos para continuar"
            }, { status: 400 });
          case "NO_DATA":
          case "SERVICE_UNAVAILABLE":
          default:
            return NextResponse.json({
              error: "Falha ao validar CPF no serviço oficial. Tente novamente em instantes."
            }, { status: 400 });
        }
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

    if (!isValidPassword(password)) {
      return NextResponse.json({
        error: "Senha inválida. Deve conter letra maiúscula, minúscula, número, caractere especial e mínimo 8 caracteres."
      }, { status: 400 });
    }

    const [existing] = await db.query(
      "SELECT * FROM otp_codes WHERE email=? ORDER BY created_at DESC LIMIT 1",
      [email]
    );
    const lastOtp = (existing as any)[0];

    if (!otpUser) {
      const otp = generateOTP();
      const expireAt = new Date(Date.now() + 10 * 60 * 1000);
      const normalizedPhone = normalizePhone(telefone);

      const digits = cpfCnpj.replace(/\D/g, "");
      const hashedPassword = await bcrypt.hash(password, 10);
      const hashedCpfCnpj = await bcrypt.hash(digits, 10);
      const fingerprint = cpfCnpjFingerprint(digits);

      if (lastOtp && lastOtp.status === "pending") {
        await db.query(
          `UPDATE otp_codes
             SET otp=?, expires_at=?, nome=?, telefone=?, cpf_cnpj=?, cpf_cnpj_fingerprint=?, password_hash=?, ip=?, user_agent=?
           WHERE id=?`,
          [otp, expireAt, nome, normalizedPhone, hashedCpfCnpj, fingerprint, hashedPassword, ip, userAgent, lastOtp.id]
        );
      } else {
        await db.query(
          `INSERT INTO otp_codes (email, nome, telefone, cpf_cnpj, cpf_cnpj_fingerprint, password_hash, otp, expires_at, status, ip, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
          [email, nome, normalizedPhone, hashedCpfCnpj, fingerprint, hashedPassword, otp, expireAt, ip, userAgent]
        );
      }

      const emailBody = htmlMailTemplate
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

    if (!lastOtp) return NextResponse.json({ error: "Nenhum OTP encontrado." }, { status: 400 });
    if (lastOtp.status !== "pending") return NextResponse.json({ error: "OTP já utilizado." }, { status: 400 });
    if (new Date(lastOtp.expires_at) < new Date()) return NextResponse.json({ error: "OTP expirado." }, { status: 400 });
    if (lastOtp.otp !== otpUser) return NextResponse.json({ error: "Código incorreto." }, { status: 400 });

    try {
      await assertUniqueIdentity(lastOtp.telefone, lastOtp.cpf_cnpj);
      const [fastCheck] = await db.query(
        "SELECT id FROM users WHERE phone=? OR cpf_cnpj_fingerprint=? LIMIT 1",
        [normalizePhone(lastOtp.telefone), lastOtp.cpf_cnpj_fingerprint]
      );
      if ((fastCheck as any).length > 0) {
        await db.query(`UPDATE otp_codes SET status='blocked' WHERE id=?`, [lastOtp.id]);
        return NextResponse.json({ error: "Telefone ou CPF/CNPJ já cadastrados." }, { status: 400 });
      }
    } catch (e: any) {
      await db.query(`UPDATE otp_codes SET status='blocked' WHERE id=?`, [lastOtp.id]);
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    await db.query(`UPDATE otp_codes SET status='validated' WHERE id=?`, [lastOtp.id]);

    try {
      await db.query(
        `INSERT INTO users (email, password_hash, created_at, name, phone, cpf_or_cnpj, cpf_cnpj_fingerprint)
         VALUES (?, ?, NOW(), ?, ?, ?, ?)`,
        [
          lastOtp.email,
          lastOtp.password_hash,
          lastOtp.nome,
          normalizePhone(lastOtp.telefone),
          lastOtp.cpf_cnpj,
          lastOtp.cpf_cnpj_fingerprint,
        ]
      );
    } catch (e: any) {
      if (e?.code === "ER_DUP_ENTRY") {
        return NextResponse.json({ error: "Dados já cadastrados." }, { status: 400 });
      }
      throw e;
    }

    return NextResponse.json({
      success: true,
      message: "Conta criada com sucesso",
      redirect: "/login",
      email: lastOtp.email,
    });

  } catch (err: any) {
    console.error("[REGISTER ERROR]", err);
    return NextResponse.json({ error: err.message || "Erro ao registrar" }, { status: 500 });
  }
}
