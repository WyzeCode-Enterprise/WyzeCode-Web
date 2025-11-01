// app/api/forgot-pass/route.ts  (ajuste o nome do arquivo se o seu for outro)
import { NextRequest, NextResponse } from "next/server";
import nodemailer, { Transporter } from "nodemailer";
import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { htmlMailTemplate } from "../html-mail/template";
import { safeQuery } from "../../../lib/db-guard"; 

dotenv.config();

/* =========================================================
   SMTP / E-MAIL (pool reaproveitável + retries robustos)
========================================================= */

const SMTP_USER = process.env.SMTP_USER!;
const SMTP_PASS = process.env.SMTP_PASS!;
const SMTP_HOST = process.env.SMTP_HOST || "smtp.hostinger.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;

// sanity check
if (!SMTP_USER || !SMTP_PASS) {
  throw new Error("❌ Variáveis SMTP_USER ou SMTP_PASS não definidas no .env");
}

let transporter: Transporter | null = null;
let transporterVerified = false;

function makeTransport(): Transporter {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // 465 = SMTPS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    pool: true,
    maxConnections: 4,
    maxMessages: 200,
    // timeouts para conexões problemáticas
    connectionTimeout: 12_000,
    greetingTimeout: 8_000,
    socketTimeout: 20_000,
    tls: {
      // Em provedores com TLS intermediário às vezes o CA não bate certinho:
      // se tiver DKIM/SPF/DMARC ok, pode manter false sem risco de MITM no servidor próprio.
      rejectUnauthorized: false,
    },
  });
}

function getMailer(): Transporter {
  if (!transporter) transporter = makeTransport();
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
    // Alguns provedores bloqueiam VRFY — seguimos mesmo assim
    console.warn("[FORGOT-PASS][MAILER] verify() falhou (ok prosseguir):", err);
  }
}

function isTransientMailErr(e: any): boolean {
  const code = (e?.code || e?.errno || e?.responseCode || "").toString();
  const msg = (e?.message || e?.response || "").toString().toLowerCase();
  // erros típicos transitórios
  return (
    ["ETIMEDOUT", "ECONNECTION", "ESOCKET"].includes(code) ||
    msg.includes("timed out") ||
    msg.includes("connection closed") ||
    msg.includes("read econnreset") ||
    msg.includes("tls") ||
    msg.includes("too many connections") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("rate limit")
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function backoff(attempt: number, base = 300, cap = 4000) {
  const expo = Math.min(cap, base * 2 ** attempt);
  const jitter = Math.floor(Math.random() * base);
  return expo + jitter;
}

/** Envia e-mail com retries, recriando o transporter se necessário */
async function sendMailReliable(mail: Parameters<Transporter["sendMail"]>[0], retries = 4) {
  let lastErr: any = null;

  await ensureMailerReady();

  for (let i = 0; i <= retries; i++) {
    try {
      const info = await getMailer().sendMail(mail);
      return info;
    } catch (err: any) {
      lastErr = err;

      // Se for erro transitório, backoff e tenta de novo
      if (i < retries && isTransientMailErr(err)) {
        // recria o transporter (pool pode ter ficado zumbi)
        try {
          if (transporter) {
            try { await transporter.close(); } catch {}
          }
        } catch {}
        transporter = makeTransport();
        transporterVerified = false;

        const wait = backoff(i);
        console.warn(`[MAIL][retry ${i + 1}/${retries}] aguardando ${wait}ms…`, err?.code || err?.message);
        await sleep(wait);
        continue;
      }
      // erro permanente (ex.: caixa inexistente) — dá erro direto
      throw err;
    }
  }

  throw lastErr ?? new Error("MAIL_UNKNOWN_ERROR");
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
========================================================= */

export const runtime = "nodejs";

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
      const [userRows] = await safeQuery<any>(
        "SELECT id, name, password_hash FROM users WHERE email=? LIMIT 1",
        [cleanEmail]
      );
      const user = (userRows as any[])[0];

      if (!user) {
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
      const [lastCodes] = await safeQuery<any>(
        "SELECT id, status FROM forgot_pass_codes WHERE email=? ORDER BY created_at DESC LIMIT 1",
        [cleanEmail]
      );
      const last = (lastCodes as any[])[0];

      if (last && last.status === "pending") {
        await safeQuery(
          `UPDATE forgot_pass_codes
           SET otp=?, expires_at=?, status='pending'
           WHERE id=?`,
          [code, expireAtStr, last.id]
        );
      } else {
        await safeQuery(
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

      // montar e-mail
      const html = htmlMailTemplate
        .replace(/{{OTP}}/g, code)
        .replace(/{{NOME}}/g, user?.name || "Usuário")
        .replace(/{{IP}}/g, ip)
        .replace(/{{BROWSER}}/g, friendlyBrowser)
        .replace(/{{TITLE}}/g, "Redefinição de Senha")
        .replace(
          /{{DESC}}/g,
          "Use o código abaixo para continuar o processo de redefinição da sua senha Wyze Bank."
        );

      const text =
        `Redefinição de Senha (Wyze Bank)\n\n` +
        `Seu código de verificação é: ${code}\n\n` +
        `Solicitado em: ${new Date().toLocaleString()}\n` +
        `IP: ${ip}\n` +
        `Navegador: ${friendlyBrowser}\n` +
        `Se não foi você, ignore este e-mail.\n`;

      // Envia com retries e recriação de pool se necessário
      const info = await sendMailReliable({
        from: `"Wyze Bank" <${SMTP_USER}>`,
        to: cleanEmail,
        subject: "Código de verificação - Redefinição de senha",
        html,
        text,
        priority: "high",
        messageId: `<forgot-${Date.now()}-${Math.random().toString(36).slice(2)}@wyzebank>`,
      });

      console.log("[FORGOT-PASS] OTP enviado", {
        to: cleanEmail,
        messageId: info?.messageId,
        accepted: info?.accepted,
        rejected: info?.rejected,
      });

      return NextResponse.json({
        success: true,
        message: "Código enviado para seu email.",
      });
    }

    // ======================================================
    // FASE 2: usuário informou email + otp -> validar código
    // ======================================================
    if (cleanEmail && otp && !password) {
      const [rows] = await safeQuery<any>(
        "SELECT * FROM forgot_pass_codes WHERE email=? ORDER BY created_at DESC LIMIT 1",
        [cleanEmail]
      );
      const last = (rows as any[])[0];

      if (!last) {
        return NextResponse.json(
          { error: "Nenhum código encontrado. Gere um novo." },
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

      if (String(last.otp) !== String(otp)) {
        return NextResponse.json(
          { error: "Código incorreto." },
          { status: 400 }
        );
      }

      await safeQuery(
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
      if (!validatePasswordPolicy(password)) {
        return NextResponse.json(
          {
            error:
              "Senha inválida. Use maiúscula, minúscula, número, símbolo e mínimo 8 caracteres.",
          },
          { status: 400 }
        );
      }

      const [rows] = await safeQuery<any>(
        "SELECT * FROM forgot_pass_codes WHERE email=? ORDER BY created_at DESC LIMIT 1",
        [cleanEmail]
      );
      const last = (rows as any[])[0];

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

      const [userRows] = await safeQuery<any>(
        "SELECT id, password_hash FROM users WHERE email=? LIMIT 1",
        [cleanEmail]
      );
      const user = (userRows as any[])[0];

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

      await safeQuery(
        "UPDATE users SET password_hash=? WHERE email=? LIMIT 1",
        [newHash, cleanEmail]
      );

      await safeQuery(
        "UPDATE forgot_pass_codes SET status='blocked' WHERE id=?",
        [last.id]
      );

      return NextResponse.json({
        success: true,
        message: "Senha atualizada com sucesso.",
        email: cleanEmail,
      });
    }

    return NextResponse.json(
      { error: "Payload inválido." },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("[FORGOT-PASS FATAL ERROR]", err);

    return NextResponse.json(
      { error: err?.message || "Erro interno." },
      { status: 500 }
    );
  }
}
