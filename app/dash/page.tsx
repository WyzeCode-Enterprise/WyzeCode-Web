// Server Component - Next.js App Router
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../api/db";
import jwt from "jsonwebtoken";
import DashClient from "../api/DashClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const cookieStore = await cookies();
  const session = cookieStore.get("wzb_lg")?.value;

  if (!session) redirect("/login");

  let user: { id: number; email: string; name: string } | null = null;

  try {
    const decoded: any = jwt.verify(session, process.env.JWT_SECRET || "supersecretkey");
    const [users] = await db.query("SELECT * FROM users WHERE id = ?", [decoded.uid]);
    if (!(users as any).length) redirect("/login");
    user = (users as any)[0];
  } catch (err) {
    console.error("Erro ao validar token:", err);
    redirect("/login");
  }

  const userName = user?.name || "Usuário";
  const userEmail = user?.email || "Usuário";

  return <DashClient userName={userName} userEmail={userEmail} />;
}
