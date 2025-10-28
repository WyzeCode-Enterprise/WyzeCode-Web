import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../api/db";
import jwt from "jsonwebtoken";
import DashClient from "../api/DashClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const cookieStore = await cookies();

  // sessão Wyze padrão (tem que existir senão manda logar)
  const session = cookieStore.get("wzb_lg")?.value;
  if (!session) {
    redirect("/login");
  }

  // 🚨 NOVO: checa se temos um redirect pós-login pendente
  // tipo "http://localhost:3000/link/discord" ou "https://wyzebank.com/link/discord"
  const postLoginRedirect = cookieStore.get("wzb_postlogin_redirect")?.value || "";

  // valida JWT do usuário logado
  let user: { id: number; email: string; name: string } | null = null;

  try {
    const decoded: any = jwt.verify(
      session,
      process.env.JWT_SECRET || "supersecretkey"
    );

    // busca esse user no banco
    const [users] = await db.query("SELECT * FROM users WHERE id = ?", [
      decoded.uid,
    ]);

    if (!(users as any).length) {
      redirect("/login");
    }

    user = (users as any)[0];
  } catch (err) {
    console.error("Erro ao validar token:", err);
    redirect("/login");
  }

  // 💡 regra de pós-login:
  // se esse cara basicamente acabou de logar e o cookie wzb_postlogin_redirect
  // aponta pro fluxo de vincular discord, a gente NÃO mostra dash ainda.
  //
  // a forma mais direta é: se o redirect contém "/link/discord" -> manda pra lá.
  // isso cobre tanto localhost quanto prod.
  if (
    postLoginRedirect &&
    postLoginRedirect.includes("/link/discord")
  ) {
    // IMPORTANTE:
    // next/navigation redirect() aceita path relativo OU URL absoluta.
    // Se a string vier absoluta (http://localhost:3000/link/discord), pode mandar direto.
    // Se vier caminho tipo "/link/discord", também aceita.
    redirect(postLoginRedirect);
  }

  // se não tem pendência de ir pro fluxo Discord, segue vida normal no dash
  const userName = user?.name || "Usuário";
  const userEmail = user?.email || "Usuário";

  return <DashClient userName={userName} userEmail={userEmail} />;
}
