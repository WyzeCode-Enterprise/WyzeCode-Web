"use client";

import { useEffect } from "react";

export default function DiscordCallbackPage() {
  // apaga o cookie wzb_postlogin_redirect no browser
  function clearPostLoginCookie() {
    try {
      // sobrescreve o cookie com expiração imediata
      document.cookie =
        "wzb_postlogin_redirect=; Path=/; Max-Age=0; SameSite=Lax;";
    } catch (e) {
      console.warn("não consegui limpar wzb_postlogin_redirect no client", e);
    }
  }

  useEffect(() => {
    async function finishOAuth() {
      const code = new URLSearchParams(window.location.search).get("code");

      if (!code) {
        clearPostLoginCookie();
        window.location.href = "/link/discord";
        return;
      }

      try {
        const res = await fetch("/api/discord-vn", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ code }),
        });

        const data = await res.json();

        // limpamos o cookie assim que o fluxo do Discord tentou finalizar
        clearPostLoginCookie();

        // caso sucesso total no vínculo
        if (data?.success) {
          // base redirect que backend mandou, ou fallback local
          const baseRedirect =
            typeof data.redirect === "string" && data.redirect.length > 0
              ? data.redirect
              : "/link/discord";

          // garante que só adiciona ?success=1 uma vez
          const urlObj = new URL(
            baseRedirect,
            window.location.origin // caso venha rota relativa tipo "/link/discord"
          );
          urlObj.searchParams.set("success", "1");

          window.location.href = urlObj.toString();
          return;
        }

        // se precisa logar antes
        if (data?.needLogin && data?.loginUrl) {
          window.location.href = data.loginUrl;
          return;
        }

        // fallback padrão (sem sucesso)
        window.location.href = "/link/discord";
      } catch {
        clearPostLoginCookie();
        window.location.href = "/link/discord";
      }
    }

    finishOAuth();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white px-6">
      <div className="text-center text-white/60 text-sm animate-pulse">
        Conectando sua conta do Discord...
      </div>
    </main>
  );
}
