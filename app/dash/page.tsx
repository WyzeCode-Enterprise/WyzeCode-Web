import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../api/db";
import jwt from "jsonwebtoken";
import DashClient from "../api/Dashboard-pages/DashMain";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// tipo retornado pronto pro client
interface UserRow {
  id: number;
  email: string;
  name: string;
  phone: string;
  cpf_or_cnpj: string; // já mascarado
  __degraded?: boolean;
}

/* ---------------- crypto helpers p/ cpf/cnpj criptografado ---------------- */

function getAesKeyFromSecret() {
  const secret = process.env.JWT_SECRET || "supersecretkey";
  return crypto.createHash("sha256").update(secret).digest(); // 32 bytes
}

// descriptografa AES-256-GCM (ivB64:cipherB64:tagB64)
// retorna só dígitos puros (ex "51601396000199") ou null se falhar
function rawDecryptDoc(encrypted: string | null | undefined): string | null {
  if (!encrypted || typeof encrypted !== "string") return null;

  const parts = encrypted.split(":");
  if (parts.length !== 3) return null;

  const [ivB64, cipherB64, tagB64] = parts;

  try {
    const iv = Buffer.from(ivB64, "base64");
    const encryptedData = Buffer.from(cipherB64, "base64");
    const authTag = Buffer.from(tagB64, "base64");

    const key = getAesKeyFromSecret();

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]);

    const plain = decrypted.toString("utf8").trim();
    const digitsOnly = plain.replace(/\D/g, "");

    // aceita CPF(11) ou CNPJ(14)
    if (/^\d{11}$/.test(digitsOnly) || /^\d{14}$/.test(digitsOnly)) {
      return digitsOnly;
    }
    return null;
  } catch (err) {
    console.error("[dash] Falha ao descriptografar cpf_or_cnpj:", err);
    return null;
  }
}

/* ---------------- mascarar CPF/CNPJ e telefone ---------------- */

function maskCpf(cpfDigits: string): string {
  if (!/^\d{11}$/.test(cpfDigits)) return "—";
  const first3 = cpfDigits.slice(0, 3); // "123"
  const fourth = cpfDigits.slice(3, 4); // "4"
  return `${first3}.${fourth}*******`;
}

function maskCnpj(cnpjDigits: string): string {
  if (!/^\d{14}$/.test(cnpjDigits)) return "—";
  const first2 = cnpjDigits.slice(0, 2); // "51"
  const next3 = cnpjDigits.slice(2, 5); // "601"
  return `${first2}.${next3}.***/*******`;
}

function maskDocSmart(docDigits: string | null): string {
  if (!docDigits) return "—";
  if (docDigits.length === 11) {
    return maskCpf(docDigits);
  }
  if (docDigits.length === 14) {
    return maskCnpj(docDigits);
  }
  return "—";
}

// máscara: últimos 5 dígitos do número viram "*"
function maskPhoneLast5(originalPhone: string | null | undefined): string {
  if (!originalPhone || typeof originalPhone !== "string") return "—";

  const chars = originalPhone.split("");

  // conta dígitos totais
  const totalDigits = originalPhone.replace(/\D/g, "").length;
  const cutoff = totalDigits - 5; // depois disso, vira "*"

  let digitIndex = 0;
  for (let i = 0; i < chars.length; i++) {
    if (/\d/.test(chars[i])) {
      if (digitIndex >= cutoff) {
        chars[i] = "*";
      }
      digitIndex++;
    }
  }

  return chars.join("");
}

/* ---------------- infra log ---------------- */

function logDbErrorOnce(err: unknown) {
  const msg =
    typeof err === "object" && err !== null && "message" in err
      ? (err as any).message
      : String(err);

  const infraHints = [
    "Too many connections",
    "ECONNREFUSED",
    "PROTOCOL_CONNECTION_LOST",
    "Connection lost",
    "read ECONNRESET",
    "ETIMEDOUT",
  ];

  const infraLike = infraHints.some((frag) =>
    msg.toLowerCase().includes(frag.toLowerCase())
  );

  if (infraLike) {
    console.warn("[dash] banco indisponível:", msg);
  } else {
    console.error("[dash] erro inesperado no banco:", err);
  }
}

/* ---------------- Puxa user da sessão ---------------- */

async function getUserFromSession(): Promise<UserRow> {
  const cookieStore = await cookies();

  // cookie com o JWT
  const session = cookieStore.get("wzb_lg")?.value;
  if (!session) {
    redirect("/login");
  }

  // valida / decodifica JWT
  let decoded: any;
  try {
    decoded = jwt.verify(
      session,
      process.env.JWT_SECRET || "supersecretkey"
    );
  } catch (err) {
    console.error("[dash] JWT inválido ou expirado:", err);
    redirect("/login");
  }

  // consulta o usuário
  try {
    const [rows] = await db.query(
      `
        SELECT id, email, name, phone, cpf_or_cnpj
        FROM users
        WHERE id = ?
        LIMIT 1
      `,
      [decoded.uid]
    );

    const result = rows as Array<{
      id: number;
      email: string;
      name: string;
      phone: string;
      cpf_or_cnpj: string;
    }>;

    if (!result || result.length === 0) {
      // sessão aponta pra user que não existe
      redirect("/login");
    }

    const row = result[0];

    // descriptografa documento
    const plainDocDigits = rawDecryptDoc(row.cpf_or_cnpj);

    // máscara de CPF/CNPJ
    const maskedDoc = maskDocSmart(plainDocDigits);

    // máscara telefone
    const maskedPhone = maskPhoneLast5(row.phone);

    return {
      id: row.id,
      email: row.email,
      name: row.name,
      phone: maskedPhone,
      cpf_or_cnpj: maskedDoc,
    };
  } catch (err) {
    logDbErrorOnce(err);

    // fallback degradado caso db falhe
    return {
      id: 0,
      email: "indisponível@wyze",
      name: "Usuário",
      phone: "—",
      cpf_or_cnpj: "—",
      __degraded: true,
    };
  }
}

/* ---------------- PAGE SERVER COMPONENT ---------------- */

export default async function Page() {
  const cookieStore = await cookies();
  const postLoginRedirect =
    cookieStore.get("wzb_postlogin_redirect")?.value || "";

  const user = await getUserFromSession();

  // redireciono pós-login especial? (ex: linkar conta externa)
  if (
    postLoginRedirect &&
    postLoginRedirect.startsWith("/") &&
    postLoginRedirect.includes("/link/discord")
  ) {
    redirect(postLoginRedirect);
  }

  return (
    <DashClient
      userId={user.id || 0}
      userName={user.name || "Usuário"}
      userEmail={user.email || "indisponível@wyze"}
      userCpfOrCnpj={user.cpf_or_cnpj || "—"} // ex: "000.0*******" ou "51.601.***/*******"
      userPhone={user.phone || "—"} // últimos 5 dígitos do telefone = "*"
      degraded={!!user.__degraded}
    />
  );
}
