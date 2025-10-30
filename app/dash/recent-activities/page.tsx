import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import RecentActivitiesMain from "@/app/api/Dashboard-pages/RecentActivitiesMain";
import { getUserFromSession } from "@/app/dash/_server/user-session";

export const dynamic = "force-dynamic";

export default async function Page() {
  const cookieStore = await cookies();
  const postLoginRedirect = cookieStore.get("wzb_postlogin_redirect")?.value || "";

  const user = await getUserFromSession();

  // mantém sua lógica de pós-login (ex: /link/discord) se desejar
  if (
    postLoginRedirect &&
    postLoginRedirect.startsWith("/") &&
    postLoginRedirect.includes("/link/discord")
  ) {
    redirect(postLoginRedirect);
  }

  return (
    <RecentActivitiesMain
      userName={user.name || "Usuário"}
      userEmail={user.email || "indisponível@wyze"}
    />
  );
}
