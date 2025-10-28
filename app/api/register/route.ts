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

  // --------- helpers básicos ---------

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

  type PFCheckFail =
    | "UNDERAGE"
    | "NAME_MISMATCH"
    | "NO_DATA"
    | "SERVICE_UNAVAILABLE"
    | "NEEDS_BIRTH";

  // Validação local da PF SEM chamar API externa.
  // Ideia: exigir nome minimamente sério (nome + sobrenome), CPF não-sequência.
  // Checagem de maioridade real fica para o KYC posterior (selfie/documento).
  async function validatePF_Strict(
    cpf: string,
    nomeInformado: string
  ): Promise<
    | { ok: true }
    | { ok: false; reason: PFCheckFail; detail?: string }
  > {
    // nome tem que existir e ter pelo menos duas partes aceitáveis
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
      .filter(p => p.length >= 2); // ignora pedaços de 1 letra só

    if (partesValidas.length < 2) {
      return {
        ok: false,
        reason: "NAME_MISMATCH",
        detail: "Informe seu nome completo (nome e sobrenome).",
      };
    }

    // rejeita CPF com todos dígitos iguais, tipo 111.111.111-11
    const digits = cpf.replace(/\D/g, "");
    if (/^(\d)\1+$/.test(digits)) {
      return {
        ok: false,
        reason: "NO_DATA",
        detail: "CPF inválido.",
      };
    }

    // não dá pra checar idade real aqui sem data de nascimento oficial/declarada,
    // isso vai ser feito na etapa de verificação de documento.
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

  // Mantida para CNPJ PJ
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
    for (let i = 0; i < 9; i++) {
      sum += parseInt(cpf[i]) * (10 - i);
    }
    let rev = 11 - (sum % 11);
    if (rev >= 10) rev = 0;
    if (rev !== parseInt(cpf[9])) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(cpf[i]) * (11 - i);
    }
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
    const pepper = process.env.CPF_CNPJ_PEPPER || "wyze_default_pepper_change_me";
    const digits = cpfCnpjRaw.replace(/\D/g, "");
    const h = createHash("sha256");
    h.update(pepper + digits);
    return h.digest("hex");
  }

  async function assertUniqueIdentity(
    phoneRaw: string,
    cpfCnpjRaw: string,
    withBcryptFallback = false
  ) {
    const normalizedPhone = normalizePhone(phoneRaw);
    const fingerprint = cpfCnpjFingerprint(cpfCnpjRaw);

    // telefone único
    const [samePhone] = await db.query(
      "SELECT id FROM users WHERE phone=? LIMIT 1",
      [normalizedPhone]
    );
    if ((samePhone as any).length > 0) {
      throw new Error("Este número de telefone já está cadastrado.");
    }

    // cpf/cnpj único via fingerprint
    const [sameDocFast] = await db.query(
      "SELECT id FROM users WHERE cpf_cnpj_fingerprint=? LIMIT 1",
      [fingerprint]
    );
    if ((sameDocFast as any).length > 0) {
      throw new Error("Este CPF/CNPJ já está cadastrado.");
    }

    // fallback legado bcrypt (caso tenha usuários antigos salvos criptografados direto)
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

  // --------- handler principal ---------

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

      // IP / agente
      const xf = req.headers.get("x-forwarded-for");
      const ip = xf
        ? xf.split(",")[0].trim()
        : req.headers.get("cf-connecting-ip") ||
          req.headers.get("fastly-client-ip") ||
          (req as any).ip ||
          "unknown";

      const userAgent = req.headers.get("user-agent") || "";
      const friendlyBrowser = parseUserAgentFriendly(userAgent);

      // Telefone BR válido
      const phoneOk = await isValidPhone(telefone);
      if (!phoneOk) {
        return NextResponse.json(
          {
            error:
              "Número de Telefone inválido. (ex: +55 11 99999-9999)",
          },
          { status: 400 }
        );
      }

      // Checar duplicidade (tel / cpf/cnpj)
      try {
        await assertUniqueIdentity(telefone, cpfCnpj);
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }

      // Pessoa Física x Jurídica
      const digitsOnly = cpfCnpj.replace(/\D/g, "");
      const isPF = digitsOnly.length <= 11;

      if (isPF) {
        // PF
        if (!isValidCPF(cpfCnpj)) {
          return NextResponse.json(
            { error: "CPF inválido." },
            { status: 400 }
          );
        }

        const pf = await validatePF_Strict(cpfCnpj, nome);

        if (!pf.ok) {
          switch (pf.reason) {
            case "NAME_MISMATCH":
              return NextResponse.json(
                {
                  error:
                    "Informe seu nome completo (nome e sobrenome).",
                },
                { status: 400 }
              );

            case "NO_DATA":
            default:
              return NextResponse.json(
                {
                  error:
                    "Dados pessoais inválidos ou incompletos.",
                },
                { status: 400 }
              );
          }
        }
      } else {
        // PJ
        if (!isValidCNPJ(cpfCnpj)) {
          return NextResponse.json(
            { error: "CNPJ inválido." },
            { status: 400 }
          );
        }
        const cnpjOk = await validateCNPJWithName(cpfCnpj, nome);
        if (!cnpjOk) {
          return NextResponse.json(
            {
              error:
                "CNPJ inválido ou não confere com o nome informado.",
            },
            { status: 400 }
          );
        }
      }

      // senha forte
      if (!isValidPassword(password)) {
        return NextResponse.json(
          {
            error:
              "Senha inválida. Deve conter letra maiúscula, minúscula, número, caractere especial e mínimo 8 caracteres.",
          },
          { status: 400 }
        );
      }

      // pega OTP mais recente
      const [existing] = await db.query(
        "SELECT * FROM otp_codes WHERE email=? ORDER BY created_at DESC LIMIT 1",
        [email]
      );
      const lastOtp = (existing as any)[0];

      // Se NÃO veio otpUser do cliente -> gerar e mandar e-mail agora
      if (!otpUser) {
        const otp = generateOTP();
        const expireAt = new Date(Date.now() + 10 * 60 * 1000); // +10min
        const normalizedPhone = normalizePhone(telefone);

        const digits = cpfCnpj.replace(/\D/g, "");
        const hashedPassword = await bcrypt.hash(password, 10);
        const hashedCpfCnpj = await bcrypt.hash(digits, 10);
        const fingerprint = cpfCnpjFingerprint(digits);

        if (lastOtp && lastOtp.status === "pending") {
          // atualiza o registro OTP existente
          await db.query(
            `UPDATE otp_codes
              SET otp=?, expires_at=?, nome=?, telefone=?, cpf_cnpj=?, cpf_cnpj_fingerprint=?, password_hash=?, ip=?, user_agent=?
            WHERE id=?`,
            [
              otp,
              expireAt,
              nome,
              normalizedPhone,
              hashedCpfCnpj,
              fingerprint,
              hashedPassword,
              ip,
              userAgent,
              lastOtp.id,
            ]
          );
        } else {
          // cria um novo registro OTP
          await db.query(
            `INSERT INTO otp_codes (email, nome, telefone, cpf_cnpj, cpf_cnpj_fingerprint, password_hash, otp, expires_at, status, ip, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
            [
              email,
              nome,
              normalizedPhone,
              hashedCpfCnpj,
              fingerprint,
              hashedPassword,
              otp,
              expireAt,
              ip,
              userAgent,
            ]
          );
        }

        // monta email bonitinho
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

        await transporter.sendMail({
          from: `"Wyze Bank" <${SMTP_USER}>`,
          to: email,
          subject: "Código de verificação - Criação da conta",
          html: emailBody,
        });

        return NextResponse.json({
          success: true,
          message: "Código enviado para seu email.",
        });
      }

      // Se CHEGOU otpUser -> validar OTP e criar usuário
      if (!lastOtp)
        return NextResponse.json(
          { error: "Nenhum OTP encontrado." },
          { status: 400 }
        );

      if (lastOtp.status !== "pending")
        return NextResponse.json(
          { error: "OTP já utilizado." },
          { status: 400 }
        );

      if (new Date(lastOtp.expires_at) < new Date())
        return NextResponse.json(
          { error: "Este código de verificação está expirado" },
          { status: 400 }
        );

      if (lastOtp.otp !== otpUser)
        return NextResponse.json(
          { error: "Código incorreto." },
          { status: 400 }
        );

      // Antes de criar usuário definitivo, checa duplicidade de novo
      try {
        await assertUniqueIdentity(lastOtp.telefone, lastOtp.cpf_cnpj);
        const [fastCheck] = await db.query(
          "SELECT id FROM users WHERE phone=? OR cpf_cnpj_fingerprint=? LIMIT 1",
          [
            normalizePhone(lastOtp.telefone),
            lastOtp.cpf_cnpj_fingerprint,
          ]
        );
        if ((fastCheck as any).length > 0) {
          await db.query(
            `UPDATE otp_codes SET status='blocked' WHERE id=?`,
            [lastOtp.id]
          );
          return NextResponse.json(
            { error: "Telefone ou CPF/CNPJ já cadastrados." },
            { status: 400 }
          );
        }
      } catch (e: any) {
        await db.query(
          `UPDATE otp_codes SET status='blocked' WHERE id=?`,
          [lastOtp.id]
        );
        return NextResponse.json({ error: e.message }, { status: 400 });
      }

      // marca OTP como validado
      await db.query(
        `UPDATE otp_codes SET status='validated' WHERE id=?`,
        [lastOtp.id]
      );

      // cria usuário definitivo já em pending_verification
      try {
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
            lastOtp.cpf_cnpj,
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
