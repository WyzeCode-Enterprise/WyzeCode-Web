import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../api/db";
import jwt from "jsonwebtoken";
import DashClient from "../api/DashClient";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// tipo do usuário que vamos usar no dashboard
interface UserRow {
  id: number;
  email: string;
  name: string;
  phone: string;
  cpf_or_cnpj: string; // vamos mandar já mascarado
  __degraded?: boolean;
}

/* -------------------------------------------------
   getAesKeyFromSecret
   - deriva uma chave AES-256 a partir do JWT_SECRET
-------------------------------------------------- */
function getAesKeyFromSecret() {
  const secret = process.env.JWT_SECRET || "supersecretkey";
  return crypto.createHash("sha256").update(secret).digest(); // 32 bytes
}

/* -------------------------------------------------
   rawDecryptDoc
   - descriptografa (AES-256-GCM) o cpf_or_cnpj do banco
   - formato esperado: "ivB64:cipherB64:tagB64"
   - retorna só os dígitos puros ("51601396000199"), SEM máscara
   - se falhar, retorna null
-------------------------------------------------- */
function rawDecryptDoc(encrypted: string | null | undefined): string | null {
  if (!encrypted || typeof encrypted !== "string") return null;

  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    // dado legado que não segue o padrão? ignora
    return null;
  }

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

    // aceitamos CPF (11) ou CNPJ (14)
    if (/^\d{11}$/.test(digitsOnly) || /^\d{14}$/.test(digitsOnly)) {
      return digitsOnly;
    }

    return null;
  } catch (err) {
    console.error("[dash] Falha ao descriptografar cpf_or_cnpj:", err);
    return null;
  }
}

/* -------------------------------------------------
   maskCpf
   - input: exatamente 11 dígitos do CPF
   - output: "000.0*******"
     regra: mostra 3 primeiros, ponto,
            depois o 4º dígito, depois 7 asteriscos
     Ex: 12345678900 -> "123.4*******"
-------------------------------------------------- */
function maskCpf(cpfDigits: string): string {
  // segurança extra
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

/* -------------------------------------------------
   maskDocSmart
   - recebe os dígitos (11 ou 14)
   - decide se formata como CPF ou CNPJ
-------------------------------------------------- */
function maskDocSmart(docDigits: string | null): string {
  if (!docDigits) return "—";

  if (docDigits.length === 11) {
    // CPF
    return maskCpf(docDigits);
  }
  if (docDigits.length === 14) {
    // CNPJ
    return maskCnpj(docDigits);
  }

  return "—";
}

/* -------------------------------------------------
   maskPhoneLast5
   - regra: últimos 5 dígitos viram "*"
   - mantemos todo o resto igual
   Ex:
     "+5511987654321"
     dígitos finais "54321" -> "*****"
     resultado "+55119876*****"
   Obs: qualquer caractere não dígito (ex: "+") a gente mantém
   onde ele já tá
-------------------------------------------------- */
function maskPhoneLast5(originalPhone: string | null | undefined): string {
  if (!originalPhone || typeof originalPhone !== "string") return "—";

  // vamos substituir só dígitos, do fim pro começo, os últimos 5
  const chars = originalPhone.split("");
  let digitsSeen = 0;

  // contamos quantos dígitos existem total
  const totalDigits = originalPhone.replace(/\D/g, "").length;
  const cutoff = totalDigits - 5; // até aqui mantém real, depois mascara

  let digitIndex = 0;
  for (let i = 0; i < chars.length; i++) {
    if (/\d/.test(chars[i])) {
      if (digitIndex >= cutoff) {
        // estamos nos últimos 5 dígitos
        chars[i] = "*";
      }
      digitIndex++;
    }
  }

  return chars.join("");
}

/* -------------------------------------------------
   logDbErrorOnce
   - logging bonitinho pra erro de infra x erro lógico
-------------------------------------------------- */
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

/* -------------------------------------------------
   getUserFromSession
   - valida o cookie/JWT
   - busca o usuário no banco
   - descriptografa cpf_or_cnpj, mascara como você pediu
   - mascara telefone (últimos 5 dígitos *)
   - retorna dados prontos pro cliente
-------------------------------------------------- */
async function getUserFromSession(): Promise<UserRow> {
  const cookieStore = await cookies();

  // 1. token da sessão
  const session = cookieStore.get("wzb_lg")?.value;
  if (!session) {
    redirect("/login");
  }

  // 2. validar / decodificar JWT
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

  // 3. buscar usuário no banco
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
      // JWT aponta pra user que não existe mais
      redirect("/login");
    }

    const row = result[0];

    // 1) descriptografa doc cru
    const plainDocDigits = rawDecryptDoc(row.cpf_or_cnpj);

    // 2) gera versão mascarada do CPF/CNPJ conforme pedido
    const maskedDoc = maskDocSmart(plainDocDigits);

    // 3) mascara telefone (últimos 5 dígitos *)
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

    // fallback degradado caso o banco falhe
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

export default async function Page() {
  // também já pegamos o possível redirect pós-login
  const cookieStore = await cookies();
  const postLoginRedirect =
    cookieStore.get("wzb_postlogin_redirect")?.value || "";

  // carrega infos do usuário OU fallback degradado
  const user = await getUserFromSession();

  // se tiver um redirect especial (ex: vincular conta externa), prioriza isso
  if (
    postLoginRedirect &&
    postLoginRedirect.startsWith("/") &&
    postLoginRedirect.includes("/link/discord")
  ) {
    redirect(postLoginRedirect);
  }

  // manda tudo pro client (já mascarado)
  return (
    <DashClient
      userName={user.name || "Usuário"}
      userEmail={user.email || "indisponível@wyze"}
      userCpfOrCnpj={user.cpf_or_cnpj || "—"} // CPF: "000.0*******" / CNPJ: "51.601.***/*******"
      userPhone={user.phone || "—"} // Tel com últimos 5 dígitos = "*"
      degraded={!!user.__degraded}
    />
  );
}
