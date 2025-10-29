import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../api/db";
import jwt from "jsonwebtoken";
import DashClient from "../api/DashClient";

export const dynamic = "force-dynamic";

// tipo retornado do banco / fallback
interface UserRow {
  id: number;
  email: string;
  name: string;
  __degraded?: boolean; // marca se veio de fallback por erro infra
}

// helper interno pra logar erro de DB sem floodar
function logDbErrorOnce(err: unknown) {
  // normaliza msg
  const message =
    typeof err === "object" && err !== null && "message" in err
      ? (err as any).message
      : String(err);

  // erros clássicos de pool/conexão que não são culpa do usuário
  const infraErrors = [
    "Too many connections",
    "ECONNREFUSED",
    "PROTOCOL_CONNECTION_LOST",
    "Connection lost",
    "read ECONNRESET",
    "ETIMEDOUT",
  ];

  const looksInfra = infraErrors.some((frag) =>
    message.toLowerCase().includes(frag.toLowerCase())
  );

  if (looksInfra) {
    // infra quebrada => warn mais curto
    console.warn("[dash] banco indisponível:", message);
  } else {
    // erro inesperado => erro completo
    console.error("[dash] erro inesperado no banco:", err);
  }
}

// tenta validar sessão e carregar usuário do banco
async function getUserFromSession(): Promise<UserRow> {
  const cookieStore = await cookies();

  // 1. pegar token da sessão
  const session = cookieStore.get("wzb_lg")?.value;
  if (!session) {
    // sem sessão => sem login
    redirect("/login");
  }

  // 2. decodificar JWT
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
    // LIMIT 1 = mais eficiente e reduz risco de retorno grande
    const [rows] = await db.query(
      "SELECT id, email, name FROM users WHERE id = ? LIMIT 1",
      [decoded.uid]
    );

    const result = rows as UserRow[];

    if (!result || result.length === 0) {
      // token aponta pra um user que não existe mais
      redirect("/login");
    }

    return result[0];
  } catch (err: any) {
    // Aqui normalmente estoura "Too many connections", timeout, etc.
    logDbErrorOnce(err);

    // Fallback degradado: mantém dashboard vivo sem redirecionar à força
    // (importante: isso impede loop infinito de redirect causando mais carga no DB)
    return {
      id: 0,
      email: "indisponível@wyze",
      name: "Usuário",
      __degraded: true,
    };
  }
}

export default async function Page() {
  const cookieStore = await cookies();

  // redirecionamento pós-login (ex: vincular conta externa)
  const postLoginRedirect = cookieStore.get("wzb_postlogin_redirect")?.value || "";

  // tenta carregar usuário autenticado (ou fallback degradado)
  const user = await getUserFromSession();

  // segurança mínima: só permite redirect interno que começa com "/"
  if (
    postLoginRedirect &&
    postLoginRedirect.startsWith("/") &&
    postLoginRedirect.includes("/link/discord")
  ) {
    redirect(postLoginRedirect);
  }

  // props pro client
  const userName = user?.name || "Usuário";
  const userEmail = user?.email || "Usuário";

  // Você pode passar esse sinal pro cliente também se quiser desenhar banner de "modo offline"
  // Exemplo futuro:
  // <DashClient userName={userName} userEmail={userEmail} degraded={user.__degraded} />
  // Mas pra não quebrar seu DashClient atual eu vou manter só os dois props que já existiam:

  return <DashClient userName={userName} userEmail={userEmail} />;
}
