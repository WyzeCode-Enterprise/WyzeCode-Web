import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import nodemailer, { Transporter } from "nodemailer";
import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { htmlMailTemplate } from "../html-mail/template";

dotenv.config();

/* =========================================================
   SMTP / E-MAIL (pool reaproveitável, igual padrão do register)
========================================================= */

const SMTP_USER = process.env.SMTP_USER!;
const SMTP_PASS = process.env.SMTP_PASS!;
const SMTP_HOST = process.env.SMTP_HOST || "smtp.hostinger.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;

if (!SMTP_USER || !SMTP_PASS) {
  throw new Error("❌ Variáveis SMTP_USER ou SMTP_PASS não definidas no .env");
}

let transporter: Transporter | null = null;
let transporterVerified = false;

function getMailer(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },

      pool: true,
      maxConnections: 3,
      maxMessages: 50,

      tls: {
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
    console.log("[FORGOT-PASS][MAILER] SMTP verificado.");
  } catch (err) {
    console.warn(
      "[FORGOT-PASS][MAILER] Falha em verify(). Alguns provedores bloqueiam VRFY:",
      err
    );
    // não damos throw: vamos tentar mandar mesmo assim
  }
}

/* =========================================================
   HELPERS GERAIS
========================================================= */

function generateOTP() {
  return randomInt(100000, 999999).toString();
}

// Senha forte: maiúscula, minúscula, número, símbolo, min 8 chars
function validatePasswordPolicy(pw: string | undefined): boolean {
  if (!pw) return false;
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/.test(pw);
}

// extrai IP confiável
function getClientIP(req: NextRequest): string {
  const xfIp = req.headers.get("x-forwarded-for");
  const ipFromForward = xfIp ? xfIp.split(",")[0].trim() : null;

  return (
    ipFromForward ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("fastly-client-ip") ||
    (req as any).ip ||
    "unknown"
  );
}

// gera string amigável tipo "Chrome (Windows)"
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

// helper pra formatar Date -> "YYYY-MM-DD HH:MM:SS.mmm" (bom pra DATETIME(3))
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
   ROTA / ESCOPO
=========================================================

Fluxo:

FASE 1 (enviar código):
  body: { email }
  -> gera OTP, salva como 'pending' em forgot_pass_codes, envia e-mail

FASE 2 (validar OTP):
  body: { email, otp }
  -> valida se OTP está ok e não expirou, muda status => 'validated'

FASE 3 (trocar senha):
  body: { email, otp, password }
  -> checa status 'validated', policy de senha, troca password_hash no users,
     marca forgot_pass_codes como 'blocked'

Observações importantes:
- Não vaza se a conta não existe (resposta genérica) OU pode vazar?
  Você hoje já fala "Email não encontrado." em FASE 1. Vou manter isso.
  Se quiser mais privacidade, a gente pode sempre responder sucesso mesmo sem conta.
- Evita reusar código validado.

========================================================= */

export async function POST(req: NextRequest) {
  try {
    const { email, otp, password } = await req.json();

    // normalizar email
    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    // info ambiente (pra log no email)
    const ip = getClientIP(req);
    const userAgentRaw = req.headers.get("user-agent") || "";
    const friendlyBrowser = parseUserAgentFriendly(userAgentRaw);

    // ======================================================
    // FASE 1: usuário informou só email -> gerar e enviar código
    // ======================================================
    if (cleanEmail && !otp && !password) {
      // buscar usuário
      const [userRows] = await db.query(
        "SELECT id, name, password_hash FROM users WHERE email=? LIMIT 1",
        [cleanEmail]
      );
      const user = (userRows as any)[0];

      if (!user) {
        // você atualmente retorna erro se não achar o email.
        // mantendo o mesmo comportamento.
        return NextResponse.json(
          { error: "Email não encontrado." },
          { status: 400 }
        );
      }

      // gera OTP e expiração (+10min)
      const code = generateOTP();
      const expireAt = new Date(Date.now() + 10 * 60 * 1000);
      const expireAtStr = toMySQLDateTime(expireAt);

      // pega último registro de forgot_pass_codes pra esse e-mail
      const [lastCodes] = await db.query(
        "SELECT id, status FROM forgot_pass_codes WHERE email=? ORDER BY created_at DESC LIMIT 1",
        [cleanEmail]
      );
      const last = (lastCodes as any)[0];

      if (last && last.status === "pending") {
        // atualiza o registro pendente existente em vez de criar outro
        await db.query(
          `UPDATE forgot_pass_codes
           SET otp=?, expires_at=?, status='pending'
           WHERE id=?`,
          [code, expireAtStr, last.id]
        );
      } else {
        // cria um novo registro
        await db.query(
          `INSERT INTO forgot_pass_codes (
            email,
            otp,
            expires_at,
            status,
            ip,
            user_agent
          )
          VALUES (?, ?, ?, 'pending', ?, ?)`,
          [cleanEmail, code, expireAtStr, ip, userAgentRaw]
        );
      }

      // montar e-mail HTML bonitinho
      const emailBody = htmlMailTemplate
        .replace(/{{OTP}}/g, code)
        .replace(/{{NOME}}/g, user?.name || "Usuário")
        .replace(/{{IP}}/g, ip)
        .replace(/{{BROWSER}}/g, friendlyBrowser)
        .replace(/{{TITLE}}/g, "Redefinição de Senha")
        .replace(
          /{{DESC}}/g,
          "Use o código abaixo para continuar o processo de redefinição da sua senha Wyze Bank."
        );

      // garantir conexão SMTP pool já validada
      await ensureMailerReady();

      try {
        const info = await getMailer().sendMail({
          from: `"Wyze Bank" <${SMTP_USER}>`,
          to: cleanEmail,
          subject: "Código de verificação - Redefinição de senha",
          html: emailBody,
        });

        console.log("[FORGOT-PASS] OTP enviado", {
          to: cleanEmail,
          messageId: info.messageId,
        });
      } catch (mailErr: any) {
        console.error("[FORGOT-PASS] Falha ao enviar OTP:", mailErr);

        return NextResponse.json(
          {
            error:
              "Não foi possível enviar o código de verificação agora. Tente novamente em instantes.",
            code: "EMAIL_SEND_FAILED",
          },
          { status: 502 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Código enviado para seu email.",
      });
    }

    // ======================================================
    // FASE 2: usuário informou email + otp -> validar código
    // ======================================================
    if (cleanEmail && otp && !password) {
      // pega o último OTP
      const [rows] = await db.query(
        "SELECT * FROM forgot_pass_codes WHERE email=? ORDER BY created_at DESC LIMIT 1",
        [cleanEmail]
      );
      const last = (rows as any)[0];

      if (!last) {
        return NextResponse.json(
          { error: "Nenhum código encontrado. Gere um novo." },
          { status: 400 }
        );
      }

      if (last.status !== "pending") {
        // se já usou / bloqueou, não deixa validar de novo
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

      if (String(last.otp) !== String(otp)) {
        return NextResponse.json(
          { error: "Código incorreto." },
          { status: 400 }
        );
      }

      // marca este OTP como validado
      await db.query(
        "UPDATE forgot_pass_codes SET status='validated' WHERE id=?",
        [last.id]
      );

      return NextResponse.json({
        success: true,
        message: "Código validado. Agora informe a nova senha.",
      });
    }

    // ======================================================
    // FASE 3: email + otp + password -> atualizar senha
    // ======================================================
    if (cleanEmail && otp && password) {
      // aplica política de senha
      if (!validatePasswordPolicy(password)) {
        return NextResponse.json(
          {
            error:
              "Senha inválida. Use maiúscula, minúscula, número, símbolo e mínimo 8 caracteres.",
          },
          { status: 400 }
        );
      }

      // pega último OTP desse e-mail
      const [rows] = await db.query(
        "SELECT * FROM forgot_pass_codes WHERE email=? ORDER BY created_at DESC LIMIT 1",
        [cleanEmail]
      );
      const last = (rows as any)[0];

      // validar se o OTP tá correto e em status certo
      if (
        !last ||
        last.status !== "validated" ||
        String(last.otp) !== String(otp) ||
        new Date(last.expires_at) < new Date()
      ) {
        return NextResponse.json(
          { error: "Código inválido ou expirado." },
          { status: 400 }
        );
      }

      // buscar usuário
      const [userRows] = await db.query(
        "SELECT id, password_hash FROM users WHERE email=? LIMIT 1",
        [cleanEmail]
      );
      const user = (userRows as any)[0];

      if (!user) {
        return NextResponse.json(
          { error: "Usuário não encontrado." },
          { status: 400 }
        );
      }

      // evita redefinir pra mesma senha
      const samePassword = await bcrypt.compare(
        password,
        user.password_hash
      );
      if (samePassword) {
        return NextResponse.json(
          { error: "A nova senha não pode ser igual à senha atual." },
          { status: 400 }
        );
      }

      // gera hash novo
      const newHash = await bcrypt.hash(password, 10);

      // atualiza senha do usuário
      await db.query(
        "UPDATE users SET password_hash=? WHERE email=? LIMIT 1",
        [newHash, cleanEmail]
      );

      // bloqueia esse código pra não ser reutilizado
      await db.query(
        "UPDATE forgot_pass_codes SET status='blocked' WHERE id=?",
        [last.id]
      );

      return NextResponse.json({
        success: true,
        message: "Senha atualizada com sucesso.",
        email: cleanEmail,
      });
    }

    // payload não bate nenhum fluxo
    return NextResponse.json(
      { error: "Payload inválido." },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("[FORGOT-PASS FATAL ERROR]", err);

    return NextResponse.json(
      { error: err.message || "Erro interno." },
      { status: 500 }
    );
  }
}
