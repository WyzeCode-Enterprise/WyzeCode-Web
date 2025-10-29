import { NextRequest, NextResponse } from "next/server";
import { htmlMailTemplate } from "../html-mail/template";
import nodemailer, { Transporter } from "nodemailer";
import { randomInt, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../db";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

// ========= SMTP CONFIG =========
const SMTP_USER = process.env.SMTP_USER!;
const SMTP_PASS = process.env.SMTP_PASS!;
const SMTP_HOST = process.env.SMTP_HOST || "smtp.hostinger.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;

// sanity check
if (!SMTP_USER || !SMTP_PASS) {
  throw new Error("❌ Variáveis SMTP_USER ou SMTP_PASS não definidas no .env");
}

// criamos um transporter com pool pra reusar conexão
let transporter: Transporter | null = null;
let transporterVerified = false;

function getMailer(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // SSL direto se porta 465, STARTTLS se 587 etc
      auth: { user: SMTP_USER, pass: SMTP_PASS },

      // pooling = MUITO importante pra não demorar reconectar toda hora
      pool: true,
      maxConnections: 3,
      maxMessages: 50,

      tls: {
        // alguns provedores baratos dão certificado meh
        rejectUnauthorized: false,
      },
    });
  }
  return transporter;
}

async function ensureMailerReady() {
  if (transporterVerified) return;
  const t = getMailer();
  try {
    await t.verify();
    transporterVerified = true;
    console.log("[MAILER] SMTP verificado e pronto ✉️");
  } catch (err) {
    console.error("[MAILER] Falha ao verificar SMTP:", err);
    // não damos throw aqui porque alguns servidores SMTP não suportam VRFY
    // mas se falhar no sendMail depois a gente trata
  }
}

// ========= CRYPTO HELPERS PARA CPF/CNPJ =========

// Deriva chave AES-256 a partir do JWT_SECRET
function getAesKeyFromSecret() {
  const secret = process.env.JWT_SECRET || "supersecretkey";
  return crypto.createHash("sha256").update(secret).digest(); // 32 bytes
}

// Criptografa doc puro -> "ivBase64:cipherBase64:tagBase64"
function encryptCpfCnpjAES(plainDoc: string): string {
  const key = getAesKeyFromSecret();
  const iv = crypto.randomBytes(12); // recomendado p/ GCM (96 bits)

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainDoc, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    encrypted.toString("base64"),
    authTag.toString("base64"),
  ].join(":");
}

// ========= OUTROS HELPERS =========

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
  "91","92","93","94","95","96","97","98","99",
];

type PFCheckFail =
  | "UNDERAGE"
  | "NAME_MISMATCH"
  | "NO_DATA"
  | "SERVICE_UNAVAILABLE"
  | "NEEDS_BIRTH";

function normalizeNameStrict(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function namesEqual(a: string, b: string): boolean {
  return normalizeNameStrict(a) === normalizeNameStrict(b);
}

// Validação PF mínima
async function validatePF_Strict(
  cpf: string,
  nomeInformado: string
): Promise<{ ok: true } | { ok: false; reason: PFCheckFail; detail?: string }> {
  if (!nomeInformado || typeof nomeInformado !== "string") {
    return {
      ok: false,
      reason: "NO_DATA",
      detail: "Nome inválido.",
    };
  }

  const partesValidas = nomeInformado
    .trim()
    .split(/\s+/)
    .filter((p) => p.length >= 2);

  if (partesValidas.length < 2) {
    return {
      ok: false,
      reason: "NAME_MISMATCH",
      detail: "Informe seu nome completo (nome e sobrenome).",
    };
  }

  const digits = cpf.replace(/\D/g, "");
  if (/^(\d)\1+$/.test(digits)) {
    return {
      ok: false,
      reason: "NO_DATA",
      detail: "CPF inválido.",
    };
  }

  return { ok: true };
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

// consulta CNPJ público
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
    let n = 0,
      pos = x - 7;
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
  if (u.includes("chrome") && !u.includes("edg") && !u.includes("opr"))
    browser = "Google Chrome";
  else if (u.includes("edg")) browser = "Microsoft Edge";
  else if (u.includes("firefox")) browser = "Mozilla Firefox";
  else if (u.includes("safari") && !u.includes("chrome")) browser = "Safari";
  else if (u.includes("opr") || u.includes("opera")) browser = "Opera";

  return `${browser} (${os})`;
}

function cpfCnpjFingerprint(cpfCnpjRaw: string): string {
  const pepper =
    process.env.CPF_CNPJ_PEPPER || "wyze_default_pepper_change_me";
  const digits = cpfCnpjRaw.replace(/\D/g, "");
  const h = createHash("sha256");
  h.update(pepper + digits);
  return h.digest("hex");
}

// garante que não existe outro user com mesmo phone/cpf
async function assertUniqueIdentity(
  phoneRaw: string,
  cpfCnpjRaw: string,
  withBcryptFallback = false
) {
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
    const digitsOnly = cpfCnpjRaw.replace(/\D/g, "");
    const [rows] = await db.query("SELECT id, cpf_or_cnpj FROM users");
    for (const r of rows as any[]) {
      if (r?.cpf_or_cnpj && (await bcrypt.compare(digitsOnly, r.cpf_or_cnpj))) {
        throw new Error("Este CPF/CNPJ já está cadastrado.");
      }
    }
  }
}

// ========= HANDLER PRINCIPAL =========

export async function POST(req: NextRequest) {
  try {
    const { email, nome, telefone, cpfCnpj, password, otp: otpUser } =
      await req.json();

    if (!email || !nome || !telefone || !cpfCnpj || !password) {
      return NextResponse.json(
        { error: "Todos os campos são obrigatórios." },
        { status: 400 }
      );
    }

    // captura IP / User-Agent
    const xf = req.headers.get("x-forwarded-for");
    const ip = xf
      ? xf.split(",")[0].trim()
      : req.headers.get("cf-connecting-ip") ||
        req.headers.get("fastly-client-ip") ||
        (req as any).ip ||
        "unknown";

    const userAgent = req.headers.get("user-agent") || "";
    const friendlyBrowser = parseUserAgentFriendly(userAgent);

    // 1. valida tel rápido
    const phoneOk = await isValidPhone(telefone);
    if (!phoneOk) {
      return NextResponse.json(
        {
          error: "Número de Telefone inválido. (ex: +55 11 99999-9999)",
        },
        { status: 400 }
      );
    }

    // 2. detecta PF/PJ e valida doc
    const digitsOnly = cpfCnpj.replace(/\D/g, "");
    const isPF = digitsOnly.length <= 11;

    if (isPF) {
      if (!isValidCPF(cpfCnpj)) {
        return NextResponse.json({ error: "CPF inválido." }, { status: 400 });
      }

      const pf = await validatePF_Strict(cpfCnpj, nome);
      if (!pf.ok) {
        switch (pf.reason) {
          case "NAME_MISMATCH":
            return NextResponse.json(
              {
                error: "Informe seu nome completo (nome e sobrenome).",
              },
              { status: 400 }
            );
          case "NO_DATA":
          default:
            return NextResponse.json(
              {
                error: "Dados pessoais inválidos ou incompletos.",
              },
              { status: 400 }
            );
        }
      }
    } else {
      if (!isValidCNPJ(cpfCnpj)) {
        return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
      }
      const cnpjOk = await validateCNPJWithName(cpfCnpj, nome);
      if (!cnpjOk) {
        return NextResponse.json(
          {
            error: "CNPJ inválido ou não confere com o nome informado.",
          },
          { status: 400 }
        );
      }
    }

    // 3. requisito mínimo de senha
    if (!isValidPassword(password)) {
      return NextResponse.json(
        {
          error:
            "Senha inválida. Deve conter letra maiúscula, minúscula, número, caractere especial e mínimo 8 caracteres.",
        },
        { status: 400 }
      );
    }

    // 4. anti-duplicidade (rápido)
    try {
      await assertUniqueIdentity(telefone, cpfCnpj);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    // Busca OTP mais recente já guardado pra esse email
    const [existing] = await db.query(
      "SELECT * FROM otp_codes WHERE email=? ORDER BY created_at DESC LIMIT 1",
      [email]
    );
    const lastOtp = (existing as any)[0];

    // ========== FASE 1: gerar e mandar o email ==========
    if (!otpUser) {
      // gera otp e pré-salva infos em otp_codes
      const otp = generateOTP();
      const expireAt = new Date(Date.now() + 10 * 60 * 1000); // 10min
      const normalizedPhone = normalizePhone(telefone);

      const onlyDigits = cpfCnpj.replace(/\D/g, "");
      const hashedPassword = await bcrypt.hash(password, 10);
      const hashedCpfCnpj = await bcrypt.hash(onlyDigits, 10);
      const fingerprint = cpfCnpjFingerprint(onlyDigits);

      if (lastOtp && lastOtp.status === "pending") {
        // UPDATE otp_codes existente
        await db.query(
          `UPDATE otp_codes
            SET otp=?,
                expires_at=?,
                nome=?,
                telefone=?,
                cpf_cnpj=?,
                cpf_cnpj_fingerprint=?,
                password_hash=?,
                ip=?,
                user_agent=?
          WHERE id=?`,
          [
            otp,
            expireAt,
            nome,
            normalizedPhone,
            hashedCpfCnpj,          // bcrypt
            fingerprint,            // sha256 pepper
            hashedPassword,         // bcrypt senha
            onlyDigits,             // CPF/CNPJ puro (só dígitos)
            ip,
            userAgent,
            lastOtp.id,
          ]
        );
      } else {
        // INSERT novo otp_codes
        await db.query(
          `INSERT INTO otp_codes
            (email,
             nome,
             telefone,
             cpf_cnpj,
             cpf_cnpj_fingerprint,
             password_hash,
             otp,
             expires_at,
             status,
             ip,
             user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
          [
            email,
            nome,
            normalizedPhone,
            hashedCpfCnpj,      // bcrypt
            fingerprint,        // sha256 pepper
            hashedPassword,     // bcrypt senha
            onlyDigits,         // CPF/CNPJ puro
            otp,
            expireAt,
            ip,
            userAgent,
          ]
        );
      }

      // prepara corpo do e-mail
      const emailBody = htmlMailTemplate
        .replace(/{{OTP}}/g, otp)
        .replace(/{{NOME}}/g, nome)
        .replace(/{{IP}}/g, ip)
        .replace(/{{BROWSER}}/g, friendlyBrowser)
        .replace(/{{TITLE}}/g, "Criação da conta")
        .replace(
          /{{DESC}}/g,
          "Use o código abaixo para continuar o processo de criação de sua conta Wyze Bank."
        );

      // garante transporter pronto
      await ensureMailerReady();

      // tenta enviar
      try {
        const info = await getMailer().sendMail({
          from: `"Wyze Bank" <${SMTP_USER}>`,
          to: email,
          subject: "Código de verificação - Criação da conta",
          html: emailBody,
        });

        console.log("[MAILER] OTP enviado", {
          to: email,
          messageId: info.messageId,
        });
      } catch (mailErr: any) {
        console.error("[MAILER] Falha ao enviar OTP:", mailErr);
        return NextResponse.json(
          {
            error:
              "Não foi possível enviar o código de verificação agora. Tente novamente em instantes.",
            code: "FALHA_EMAIL",
          },
          { status: 502 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Código enviado para seu email.",
      });
    }

    // ========== FASE 2: validar OTP recebido e criar user ==========
    if (!lastOtp) {
      return NextResponse.json(
        { error: "Nenhum OTP encontrado. Gere um novo código." },
        { status: 400 }
      );
    }

    if (lastOtp.status !== "pending") {
      return NextResponse.json(
        { error: "OTP já utilizado." },
        { status: 400 }
      );
    }

    if (new Date(lastOtp.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Este código de verificação está expirado." },
        { status: 400 }
      );
    }

    if (lastOtp.otp !== otpUser) {
      return NextResponse.json(
        { error: "Código incorreto." },
        { status: 400 }
      );
    }

    // double-check duplicidade antes de criar usuário definitivo
    try {
      await assertUniqueIdentity(lastOtp.telefone, lastOtp.cpf_cnpj);
      const [fastCheck] = await db.query(
        "SELECT id FROM users WHERE phone=? OR cpf_cnpj_fingerprint=? LIMIT 1",
        [normalizePhone(lastOtp.telefone), lastOtp.cpf_cnpj_fingerprint]
      );
      if ((fastCheck as any).length > 0) {
        await db.query(`UPDATE otp_codes SET status='blocked' WHERE id=?`, [
          lastOtp.id,
        ]);
        return NextResponse.json(
          { error: "Telefone ou CPF/CNPJ já cadastrados." },
          { status: 400 }
        );
      }
    } catch (e: any) {
      await db.query(`UPDATE otp_codes SET status='blocked' WHERE id=?`, [
        lastOtp.id,
      ]);
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    // marca OTP como validado
    await db.query(
      `UPDATE otp_codes SET status='validated' WHERE id=?`,
      [lastOtp.id]
    );

    // cria user final
    try {
      // documento puro que salvamos na fase 1 (onlyDigits)
      const originalDigits =
        lastOtp.plain_doc_digits &&
        String(lastOtp.plain_doc_digits).replace(/\D/g, "");

      if (!originalDigits) {
        return NextResponse.json(
          {
            error:
              "Não foi possível finalizar o cadastro. Gere um novo código de verificação.",
          },
          { status: 400 }
        );
      }

      // criptografa esse doc com AES-256-GCM usando JWT_SECRET
      const encryptedDoc = encryptCpfCnpjAES(originalDigits);

      await db.query(
        `INSERT INTO users (
          email,
          password_hash,
          created_at,
          name,
          phone,
          cpf_or_cnpj,
          cpf_cnpj_fingerprint,
          status
        )
        VALUES (?, ?, NOW(), ?, ?, ?, ?, 'pending_verification')`,
        [
          lastOtp.email,
          lastOtp.password_hash,
          lastOtp.nome,
          normalizePhone(lastOtp.telefone),
          encryptedDoc, // <<----- agora é cifrado AES, não bcrypt
          lastOtp.cpf_cnpj_fingerprint,
        ]
      );
    } catch (e: any) {
      if (e?.code === "ER_DUP_ENTRY") {
        return NextResponse.json(
          { error: "Dados já cadastrados." },
          { status: 400 }
        );
      }
      throw e;
    }

    // final
    return NextResponse.json({
      success: true,
      message: "Conta criada com sucesso",
      redirect: "/login",
      email: lastOtp.email,
    });
  } catch (err: any) {
    console.error("[REGISTER ERROR]", err);
    return NextResponse.json(
      { error: err.message || "Erro ao registrar" },
      { status: 500 }
    );
  }
}
