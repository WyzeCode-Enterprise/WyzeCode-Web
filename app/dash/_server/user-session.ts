// app/dash/_server/user-session.ts
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { db } from "@/app/api/db";

export interface UserRow {
  id: number;
  email: string;
  name: string;
  phone: string;
  cpf_or_cnpj: string; // já mascarado
  __degraded?: boolean;
}

/* ---------------- helpers locais ---------------- */
function getAesKeyFromSecret() {
  const secret = process.env.JWT_SECRET || "supersecretkey";
  return crypto.createHash("sha256").update(secret).digest(); // 32 bytes
}

// descriptografa AES-256-GCM "ivB64:cipherB64:tagB64"
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
    const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    const plain = decrypted.toString("utf8").trim();
    const digitsOnly = plain.replace(/\D/g, "");
    if (/^\d{11}$/.test(digitsOnly) || /^\d{14}$/.test(digitsOnly)) return digitsOnly;
    return null;
  } catch {
    return null;
  }
}

function maskCpf(cpfDigits: string): string {
  if (!/^\d{11}$/.test(cpfDigits)) return "—";
  const first3 = cpfDigits.slice(0, 3);
  const fourth = cpfDigits.slice(3, 4);
  return `${first3}.${fourth}*******`;
}
function maskCnpj(cnpjDigits: string): string {
  if (!/^\d{14}$/.test(cnpjDigits)) return "—";
  const first2 = cnpjDigits.slice(0, 2);
  const next3 = cnpjDigits.slice(2, 5);
  return `${first2}.${next3}.***/*******`;
}
function maskDocSmart(docDigits: string | null): string {
  if (!docDigits) return "—";
  if (docDigits.length === 11) return maskCpf(docDigits);
  if (docDigits.length === 14) return maskCnpj(docDigits);
  return "—";
}
function maskPhoneLast5(originalPhone: string | null | undefined): string {
  if (!originalPhone || typeof originalPhone !== "string") return "—";
  const chars = originalPhone.split("");
  const totalDigits = originalPhone.replace(/\D/g, "").length;
  const cutoff = totalDigits - 5;
  let digitIndex = 0;
  for (let i = 0; i < chars.length; i++) {
    if (/\d/.test(chars[i])) {
      if (digitIndex >= cutoff) chars[i] = "*";
      digitIndex++;
    }
  }
  return chars.join("");
}

function logDbErrorOnce(err: unknown) {
  const msg =
    typeof err === "object" && err !== null && "message" in err
      ? (err as any).message
      : String(err);
  const infraHints = ["Too many connections", "ECONNREFUSED", "PROTOCOL_CONNECTION_LOST", "Connection lost", "read ECONNRESET", "ETIMEDOUT"];
  const infraLike = infraHints.some((frag) => msg.toLowerCase().includes(frag.toLowerCase()));
  if (infraLike) console.warn("[session] banco indisponível:", msg);
  else console.error("[session] erro inesperado no banco:", err);
}

/* ---------------- API para páginas server-side ---------------- */
export async function getUserFromSession(): Promise<UserRow> {
  const cookieStore = await cookies();
  const session = cookieStore.get("wzb_lg")?.value;
  if (!session) redirect("/login");

  let decoded: any;
  try {
    decoded = jwt.verify(session, process.env.JWT_SECRET || "supersecretkey");
  } catch {
    redirect("/login");
  }

  try {
    const [rows] = await db.query(
      `SELECT id, email, name, phone, cpf_or_cnpj
         FROM users
        WHERE id = ?
        LIMIT 1`,
      [decoded.uid]
    );

    const result = rows as Array<{ id: number; email: string; name: string; phone: string; cpf_or_cnpj: string }>;
    if (!result || result.length === 0) redirect("/login");

    const row = result[0];
    const plainDocDigits = rawDecryptDoc(row.cpf_or_cnpj);
    const maskedDoc = maskDocSmart(plainDocDigits);
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
