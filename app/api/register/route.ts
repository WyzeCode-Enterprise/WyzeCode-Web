import { NextRequest, NextResponse } from "next/server";
import { htmlMailTemplate } from "../html-mail/template";
import nodemailer, { Transporter } from "nodemailer";
import { randomInt, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../db";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

/* =========================================================
   SMTP / E-MAIL
========================================================= */

const SMTP_USER = process.env.SMTP_USER!;
const SMTP_PASS = process.env.SMTP_PASS!;
const SMTP_HOST = process.env.SMTP_HOST || "smtp.hostinger.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;

// sanity check inicial (falha cedo = melhor que falhar só em produção)
if (!SMTP_USER || !SMTP_PASS) {
  throw new Error("❌ Variáveis SMTP_USER ou SMTP_PASS não definidas no .env");
}

// vamos reaproveitar conexão SMTP (pool) pra evitar lentidão em envios
let transporter: Transporter | null = null;
let transporterVerified = false;

function getMailer(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // porta 465 = SSL direto
      auth: { user: SMTP_USER, pass: SMTP_PASS },

      // pooling = MUITO importante pra não reconectar a cada sendMail
      pool: true,
      maxConnections: 3,
      maxMessages: 50,

      tls: {
        // alguns provedores baratos usam certificado meia-boca
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
    // não damos throw aqui, alguns servidores bloqueiam VRFY
    // se der pau depois no sendMail, a gente trata lá
  }
}

/* =========================================================
   HELPERS: CPF/CNPJ (hash, crypto AES-GCM, fingerprint)
========================================================= */

// chave AES-256 derivada do JWT_SECRET
function getAesKeyFromSecret() {
  const secret = process.env.JWT_SECRET || "supersecretkey";
  return crypto.createHash("sha256").update(secret).digest(); // 32 bytes
}

// criptografa doc puro -> "ivBase64:cipherBase64:tagBase64"
function encryptCpfCnpjAES(plainDoc: string): string {
  const key = getAesKeyFromSecret();
  const iv = crypto.randomBytes(12); // 96 bits p/ GCM

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

// fingerprint estável (sha256 + pepper). usado pra UNIQUE no banco
function cpfCnpjFingerprint(cpfCnpjRaw: string): string {
  const pepper = process.env.CPF_CNPJ_PEPPER || "wyze_default_pepper_change_me";
  const digits = cpfCnpjRaw.replace(/\D/g, "");
  const h = createHash("sha256");
  h.update(pepper + digits);
  return h.digest("hex");
}

/* =========================================================
   HELPERS DE VALIDAÇÃO E NORMALIZAÇÃO
========================================================= */

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

// Validação PF mínima (placeholder de antifraude básico)
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

  // exige pelo menos nome + sobrenome
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
  // bloqueia óbvios CPFs inválidos (11111111111 etc)
  if (/^(\d)\1+$/.test(digits)) {
    return {
      ok: false,
      reason: "NO_DATA",
      detail: "CPF inválido.",
    };
  }

  // aqui poderia entrar checagem de idade/receita/etc se quiser depois
  return { ok: true };
}

// normaliza para formato +5511999999999
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? "+" + digits : "+55" + digits;
}

async function isValidPhone(phone: string) {
  const normalized = normalizePhone(phone);
  // formato: +55DD9XXXXXXXX (11 dígitos após DDD)
  const brRegex = /^\+55\d{2}9\d{8}$/;
  if (!brRegex.test(normalized)) return false;

  const digits = normalized.replace(/\D/g, "");
  const ddd = digits.slice(2, 4);
  const number = digits.slice(4);

  if (!validDDDs.includes(ddd)) return false;
  if (number.length !== 9 || !number.startsWith("9")) return false;

  return true;
}

// Valida CNPJ por API pública simples + match de razão social
async function validateCNPJWithName(cnpj: string, razao: string) {
  const digits = cnpj.replace(/\D/g, "");
  const resp = await fetch(`https://publica.cnpj.ws/cnpj/${digits}`);
  if (!resp.ok) return false;
  const data = await resp.json();
  if (!data?.razao_social) return false;
  // não precisa bater 100%, mas precisa conter
  return data.razao_social.toLowerCase().includes(razao.toLowerCase());
}

// valida estrutura e dígitos verificadores CPF
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

// valida estrutura e dígitos verificadores CNPJ
function isValidCNPJ(cnpj: string): boolean {
  cnpj = cnpj.replace(/\D/g, "");
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;

  const t = cnpj.length - 2;
  const d = cnpj.substring(t);
  const d1 = parseInt(d[0]);
  const d2 = parseInt(d[1]);

  const calc = (x: number) => {
    let n = 0;
    let pos = x - 7;
    for (let i = x; i >= 1; i--) {
      n += parseInt(cnpj[x - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    return (n % 11) < 2 ? 0 : 11 - (n % 11);
  };

  return calc(12) === d1 && calc(13) === d2;
}

// política mínima de senha
function isValidPassword(pw: string): boolean {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/.test(pw);
}

// OTP 6 dígitos
function generateOTP() {
  return randomInt(100000, 999999).toString();
}

// pra log bonito no e-mail
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

// checa unicidade (telefone / documento) antes de cadastrar
async function assertUniqueIdentity(
  phoneRaw: string,
  cpfCnpjRaw: string,
  withBcryptFallback = false
) {
  const normalizedPhone = normalizePhone(phoneRaw);
  const fingerprint = cpfCnpjFingerprint(cpfCnpjRaw);

  // telefone já existe?
  const [samePhone] = await db.query(
    "SELECT id FROM users WHERE phone=? LIMIT 1",
    [normalizedPhone]
  );
  if ((samePhone as any).length > 0) {
    throw new Error("Este número de telefone já está cadastrado.");
  }

  // fingerprint do doc já existe?
  const [sameDocFast] = await db.query(
    "SELECT id FROM users WHERE cpf_cnpj_fingerprint=? LIMIT 1",
    [fingerprint]
  );
  if ((sameDocFast as any).length > 0) {
    throw new Error("Este CPF/CNPJ já está cadastrado.");
  }

  // fallback legado com bcrypt no campo cpf_or_cnpj (caso você tenha base antiga)
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

// helper de data MySQL "YYYY-MM-DD HH:MM:SS.mmm"
function toMySQLDateTime(d: Date) {
  const pad = (n: number, len = 2) => n.toString().padStart(len, "0");
  const yyyy = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  const ms = pad(d.getMilliseconds(), 3);
  return `${yyyy}-${MM}-${dd} ${hh}:${mm}:${ss}.${ms}`;
}

/* =========================================================
   HANDLER PRINCIPAL (POST /api/register)
========================================================= */

export async function POST(req: NextRequest) {
  try {
    // body esperado
    const { email, nome, telefone, cpfCnpj, password, otp: otpUser } =
      await req.json();

    if (!email || !nome || !telefone || !cpfCnpj || !password) {
      return NextResponse.json(
        { error: "Todos os campos são obrigatórios." },
        { status: 400 }
      );
    }

    // captura IP / User-Agent do request reverso/reverso CDN/etc
    const xf = req.headers.get("x-forwarded-for");
    const ip =
      (xf ? xf.split(",")[0].trim() : null) ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("fastly-client-ip") ||
      (req as any).ip ||
      "unknown";

    const userAgent = req.headers.get("user-agent") || "";
    const friendlyBrowser = parseUserAgentFriendly(userAgent);

    /* ---------------------------------
       1. valida telefone
    --------------------------------- */
    const phoneOk = await isValidPhone(telefone);
    if (!phoneOk) {
      return NextResponse.json(
        { error: "Número de Telefone inválido. (ex: +55 11 99999-9999)" },
        { status: 400 }
      );
    }

    /* ---------------------------------
       2. valida CPF/CNPJ + nome
    --------------------------------- */
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
              { error: "Informe seu nome completo (nome e sobrenome)." },
              { status: 400 }
            );
          case "NO_DATA":
          default:
            return NextResponse.json(
              { error: "Dados pessoais inválidos ou incompletos." },
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

    /* ---------------------------------
       3. valida senha
    --------------------------------- */
    if (!isValidPassword(password)) {
      return NextResponse.json(
        {
          error:
            "Senha inválida. Deve conter letra maiúscula, minúscula, número, caractere especial e mínimo 8 caracteres.",
        },
        { status: 400 }
      );
    }

    /* ---------------------------------
       4. anti-duplicidade rápida
    --------------------------------- */
    try {
      await assertUniqueIdentity(telefone, cpfCnpj);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    /* ---------------------------------
       Buscar último OTP desse e-mail
    --------------------------------- */
    const [existing] = await db.query(
      "SELECT * FROM otp_codes WHERE email=? ORDER BY created_at DESC LIMIT 1",
      [email]
    );
    const lastOtp = (existing as any)[0];

    /* ---------------------------------
       FASE 1: gerar e enviar OTP (se ainda não recebi otpUser)
    --------------------------------- */
    if (!otpUser) {
      const otp = generateOTP();
      const expireAt = new Date(Date.now() + 10 * 60 * 1000); // agora +10min
      const expireAtStr = toMySQLDateTime(expireAt);

      const normalizedPhone = normalizePhone(telefone);

      const onlyDigits = cpfCnpj.replace(/\D/g, "");
      const hashedPassword = await bcrypt.hash(password, 10); // senha bcrypt
      const hashedCpfCnpj = await bcrypt.hash(onlyDigits, 10); // doc bcrypt
      const fingerprint = cpfCnpjFingerprint(onlyDigits); // doc fingerprint estável

      // Se já existe otp_codes "pending" pra esse email, atualiza.
      // MUITO IMPORTANTE: manter a ORDEM das colunas e dos valores alinhada.
      if (lastOtp && lastOtp.status === "pending") {
        await db.query(
          `UPDATE otp_codes
             SET
               nome=?,
               telefone=?,
               cpf_cnpj=?,                -- bcrypt do doc
               cpf_cnpj_fingerprint=?,    -- sha256 fingerprint
               plain_doc_digits=?,        -- doc puro só dígitos
               password_hash=?,           -- bcrypt senha
               otp=?,                     -- novo código OTP
               expires_at=?,              -- nova expiração
               ip=?,
               user_agent=?
           WHERE id=?`,
          [
            nome,
            normalizedPhone,
            hashedCpfCnpj,
            fingerprint,
            onlyDigits,
            hashedPassword,
            otp,
            expireAtStr,
            ip,
            userAgent,
            lastOtp.id,
          ]
        );
      } else {
        // cria um novo otp_codes
        // IMPORTANTE: agora a lista de colunas bate EXATAMENTE com os valores
        await db.query(
          `INSERT INTO otp_codes (
             email,
             nome,
             telefone,
             cpf_cnpj,
             cpf_cnpj_fingerprint,
             plain_doc_digits,
             password_hash,
             otp,
             expires_at,
             status,
             ip,
             user_agent
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
          [
            email,            // email
            nome,             // nome
            normalizedPhone,  // telefone normalizado
            hashedCpfCnpj,    // cpf_cnpj (bcrypt do doc)
            fingerprint,      // cpf_cnpj_fingerprint (sha256 pepper)
            onlyDigits,       // plain_doc_digits (doc puro p/ depois criar user)
            hashedPassword,   // password_hash (bcrypt senha)
            otp,              // otp gerado
            expireAtStr,      // expires_at
            ip,               // ip
            userAgent,        // user_agent bruto
          ]
        );
      }

      // monta corpo do e-mail HTML
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

      // valida transporter
      await ensureMailerReady();

      // envia e-mail
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

    /* ---------------------------------
       FASE 2: validar OTP recebido e criar usuário
    --------------------------------- */

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

    if (String(lastOtp.otp) !== String(otpUser)) {
      return NextResponse.json(
        { error: "Código incorreto." },
        { status: 400 }
      );
    }

    // double-check duplicidade ANTES de criar user de fato
    try {
      await assertUniqueIdentity(lastOtp.telefone, lastOtp.plain_doc_digits);
      const [fastCheck] = await db.query(
        "SELECT id FROM users WHERE phone=? OR cpf_cnpj_fingerprint=? LIMIT 1",
        [normalizePhone(lastOtp.telefone), lastOtp.cpf_cnpj_fingerprint]
      );
      if ((fastCheck as any).length > 0) {
        // marca esse OTP como bloqueado pra não reusar
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
    await db.query(`UPDATE otp_codes SET status='validated' WHERE id=?`, [
      lastOtp.id,
    ]);

    // agora cria o usuário final
    try {
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

      // criptografa doc puro antes de salvar no users
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
          encryptedDoc, // cpf_or_cnpj: armazenado cifrado AES
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

    // sucesso 🎉
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
