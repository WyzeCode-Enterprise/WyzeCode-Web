"use client";

import React from "react";

type DiscordLinkedUser = {
  id: string;
  username: string;
  avatar?: string | null;
};

type LegacyGetResp = {
  // formato antigo
  ready?: boolean;
  needLogin?: boolean;
  loginUrl?: string;
  discordAuthUrl?: string | null;
  user?: DiscordLinkedUser | null;
  error?: string;
};

type NewGetResp = {
  // formato novo
  status?: "NEED_LOGIN" | "READY" | "NEED_DISCORD_AUTH" | "ERROR";
  user?: DiscordLinkedUser | null;
  discordAuthUrl?: string | null;
  loginUrl?: string | null;
  error?: string | null;
};

type LegacyPostResp = {
  // formato antigo
  success?: boolean;
  alreadyLinked?: boolean;
  redirect?: string;
  user?: DiscordLinkedUser | null;
  needLogin?: boolean;
  loginUrl?: string;
  error?: string;
};

type NewPostResp = {
  // formato novo
  status?:
    | "LINKED"
    | "CONFLICT"
    | "NEED_LOGIN"
    | "ERROR";
  redirect?: string;
  user?: DiscordLinkedUser | null;
  needLogin?: boolean;
  loginUrl?: string;
  error?: string | null;
};

function mapGetStatus(payload: LegacyGetResp | NewGetResp):
  | { status: "NEED_LOGIN"; loginUrl: string }
  | { status: "READY"; user: DiscordLinkedUser }
  | { status: "NEED_DISCORD_AUTH"; discordAuthUrl: string }
  | { status: "ERROR"; error?: string } {
  // novo formato
  if ("status" in payload && payload.status) {
    if (payload.status === "NEED_LOGIN") {
      return {
        status: "NEED_LOGIN",
        loginUrl:
          (payload as NewGetResp).loginUrl ||
          "/login?redirect=" + encodeURIComponent("https://wyzebank.com/link/discord"),
      };
    }
    if (payload.status === "READY" && payload.user) {
      return { status: "READY", user: payload.user };
    }
    if (payload.status === "NEED_DISCORD_AUTH" && payload.discordAuthUrl) {
      return { status: "NEED_DISCORD_AUTH", discordAuthUrl: payload.discordAuthUrl };
    }
    if (payload.status === "ERROR") {
      return { status: "ERROR", error: (payload as NewGetResp).error || "Erro" };
    }
  }

  // legado
  const legacy = payload as LegacyGetResp;
  if (legacy.needLogin && legacy.loginUrl) {
    return { status: "NEED_LOGIN", loginUrl: legacy.loginUrl };
  }
  if (legacy.ready && legacy.user) {
    return { status: "READY", user: legacy.user };
  }
  if (!legacy.ready && legacy.discordAuthUrl) {
    return { status: "NEED_DISCORD_AUTH", discordAuthUrl: legacy.discordAuthUrl };
  }
  return { status: "ERROR", error: legacy.error || "Resposta inesperada do servidor." };
}

function mapPostStatus(payload: LegacyPostResp | NewPostResp):
  | { status: "NEED_LOGIN"; loginUrl: string }
  | { status: "LINKED"; user?: DiscordLinkedUser; redirect?: string }
  | { status: "ERROR"; error?: string } {
  // novo
  if ("status" in payload && payload.status) {
    if (payload.status === "NEED_LOGIN") {
      return {
        status: "NEED_LOGIN",
        loginUrl:
          (payload as NewPostResp).loginUrl ||
          "/login?redirect=" + encodeURIComponent("https://wyzebank.com/link/discord"),
      };
    }
    if (payload.status === "LINKED") {
      return {
        status: "LINKED",
        user: (payload as NewPostResp).user || undefined,
        redirect: (payload as NewPostResp).redirect,
      };
    }
    return { status: "ERROR", error: (payload as NewPostResp).error || "Erro ao vincular Discord." };
  }

  // legado
  const legacy = payload as LegacyPostResp;
  if (legacy.needLogin && legacy.loginUrl) {
    return { status: "NEED_LOGIN", loginUrl: legacy.loginUrl };
  }
  if (legacy.success || legacy.alreadyLinked) {
    return { status: "LINKED", user: legacy.user || undefined, redirect: legacy.redirect };
  }
  return { status: "ERROR", error: legacy.error || "Falha ao finalizar OAuth Discord." };
}

export default function DiscordLinkPage() {
  const [loading, setLoading] = React.useState(true);
  const [sessionUser, setSessionUser] = React.useState<DiscordLinkedUser | null>(null);
  const [fatalError, setFatalError] = React.useState<string | null>(null);

  // apaga o cookie de pós-login ao entrar nesta tela
  React.useEffect(() => {
    try {
      document.cookie = "wzb_postlogin_redirect=; Path=/; Max-Age=0; SameSite=Lax;";
    } catch {}
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    // evita redirect loop pro Discord armazenando um carimbo em sessionStorage
    function markDiscordRedirected() {
      try {
        sessionStorage.setItem("discord_oauth_redirected_at", String(Date.now()));
      } catch {}
    }
    function hasRecentDiscordRedirect(): boolean {
      try {
        const v = sessionStorage.getItem("discord_oauth_redirected_at");
        if (!v) return false;
        const t = Number(v);
        // 90s de janela para evitar loops
        return Number.isFinite(t) && Date.now() - t < 90_000;
      } catch {
        return false;
      }
    }

    async function finalizeWithCode(oauthCode: string) {
      try {
        const res = await fetch("/api/discord-vn", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          credentials: "include",
          body: JSON.stringify({ code: oauthCode }),
        });
        const data: LegacyPostResp | NewPostResp = await res.json();
        if (cancelled) return;

        const mapped = mapPostStatus(data);
        if (mapped.status === "NEED_LOGIN") {
          window.location.href = mapped.loginUrl;
          return;
        }
        if (mapped.status === "LINKED") {
          if (mapped.user) setSessionUser(mapped.user);

          // limpa query params sem reload
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete("code");
          cleanUrl.searchParams.delete("state");
          window.history.replaceState({}, "", cleanUrl.toString());

          setLoading(false);
          return;
        }
        setFatalError(mapped.error || "Erro ao vincular Discord.");
        setLoading(false);
      } catch (err: any) {
        console.error("Erro no finalizeWithCode:", err);
        setFatalError("Falha de rede ao finalizar OAuth. Tente novamente.");
        setLoading(false);
      }
    }

    async function checkSession() {
      try {
        const res = await fetch("/api/discord-vn", {
          method: "GET",
          headers: { "Cache-Control": "no-store" },
          credentials: "include",
        });
        const data: LegacyGetResp | NewGetResp = await res.json();
        if (cancelled) return;

        const mapped = mapGetStatus(data);

        if (mapped.status === "NEED_LOGIN") {
          window.location.href = mapped.loginUrl;
          return;
        }

        if (mapped.status === "READY") {
          setSessionUser(mapped.user);
          setLoading(false);
          return;
        }

        if (mapped.status === "NEED_DISCORD_AUTH") {
          if (!hasRecentDiscordRedirect()) {
            markDiscordRedirected();
            window.location.href = mapped.discordAuthUrl;
            return;
          }
          // se já redirecionamos há pouco e voltamos sem code, mostre erro ao invés de loopar
          setFatalError("Não foi possível completar o OAuth do Discord. Recarregue a página e tente novamente.");
          setLoading(false);
          return;
        }

        setFatalError(mapped.error || "Fluxo Discord inesperado.");
        setLoading(false);
      } catch (e) {
        console.error("Erro checando sessão discord", e);
        setFatalError("Falha de rede ao checar sessão. Tente novamente.");
        setLoading(false);
      }
    }

    // fluxo principal
    const params = new URLSearchParams(window.location.search);
    const oauthCode = params.get("code");

    if (oauthCode) {
      finalizeWithCode(oauthCode);
    } else {
      checkSession();
    }

    return () => {
      cancelled = true;
    };
  }, []);

  /* ================= LOADING / SKELETON ================= */
  if (loading) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center bg-black text-white px-6 overflow-hidden antialiased">
        <div
          className="
            pointer-events-none absolute top-[-200px] left-1/2 -translate-x-1/2
            h-[480px] w-[900px] rounded-[999px] blur-[120px] opacity-[0.28]
            bg-[radial-gradient(ellipse_at_center,rgba(88,101,242,0.55)_0%,rgba(38,255,89,0.18)_40%,rgba(0,0,0,0)_70%)]
          "
          aria-hidden="true"
        />
        <div
          className="
            pointer-events-none absolute top-0 left-0 right-0 h-[100vh]
            bg-[radial-gradient(circle_at_top,rgba(88,101,242,0.22)_0%,rgba(0,0,0,0)_70%)]
            opacity-70
          "
          aria-hidden="true"
        />
        <section className="relative z-10 flex flex-col items-center text-center gap-6 w-full max-w-[600px] rounded-xl backdrop-blur-md px-6 py-8">
          <div className="flex items-center gap-6">
            <div className="h-[60px] w-[60px] rounded-full bg-white/10 animate-pulse" />
            <div className="h-[10px] w-[10px] rounded bg-[#26FF59]/20 animate-pulse" />
            <div className="h-[52px] w-[52px] rounded-full bg-white/10 animate-pulse" />
          </div>
          <div className="flex flex-col items-center gap-3 max-w-[90vw]">
            <div className="h-4 w-[260px] rounded bg-white/10 animate-pulse" />
            <div className="h-3 w-[200px] rounded bg-white/5 animate-pulse" />
          </div>
        </section>
        <footer className="relative z-10 mt-16 w-full max-w-[420px] flex flex-col items-center text-center text-[12px] leading-relaxed text-white/40">
          <div className="h-px w-full max-w-[600px] bg-white/5 mb-4" />
          <div className="h-3 w-[320px] rounded bg-white/5 animate-pulse" />
        </footer>
      </main>
    );
  }

  /* ================= ERRO FATAL ================= */
  if (fatalError && !sessionUser) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center bg-black text-white px-6 overflow-hidden antialiased">
        <section className="relative z-10 flex flex-col items-center text-center gap-4 w-full max-w-[560px] rounded-xl backdrop-blur-md px-6 py-8">
          <h1 className="text-xl font-semibold">Algo deu errado</h1>
          <p className="text-white/70">{fatalError}</p>
          <button
            onClick={() => location.reload()}
            className="mt-2 rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5 transition-colors"
          >
            Tentar novamente
          </button>
        </section>
      </main>
    );
  }

  /* ================= SUCESSO ================= */
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-black text-white px-6 overflow-hidden antialiased">
      {/* aurora topo */}
      <div
        className="
          pointer-events-none absolute top-[-200px] left-1/2 -translate-x-1/2
          h-[480px] w-[900px] rounded-[999px] blur-[120px] opacity-[0.28]
          bg-[radial-gradient(ellipse_at_center,rgba(88,101,242,0.55)_0%,rgba(38,255,89,0.18)_40%,rgba(0,0,0,0)_70%)]
        "
        aria-hidden="true"
      />
      <div
        className="
          pointer-events-none absolute top-0 left-0 right-0 h-[100vh]
          bg-[radial-gradient(circle_at_top,rgba(88,101,242,0.22)_0%,rgba(0,0,0,0)_70%)]
          opacity-70
        "
        aria-hidden="true"
      />
      <section
        className="
          relative z-10 flex flex-col items-center text-center gap-6
          w-full max-w-[600px] rounded-xl backdrop-blur-md px-6 py-8
        "
      >
        <div className="relative flex items-center gap-6">
          <div
            className="
              absolute -inset-8 pointer-events-none rounded-[24px]
              bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.10)_0%,rgba(0,0,0,0)_70%)]
              opacity-70 blur-2xl
            "
            aria-hidden="true"
          />
          <img
            src="https://wyzebank.com/lg_files_wb/png_files/isotipo_white.png"
            alt="Discord"
            className="relative h-[60px] w-auto"
          />
          <span className="relative text-[#26FF59] text-3xl font-medium leading-none select-none">+</span>
          <img
            src="https://wyzebank.com/lg_files_wb/wzc_imgs/v1/66e3d7f4ef6498ac018f2c55_Symbol.svg"
            alt="Wyze Bank"
            className="relative h-[52px] w-auto"
          />
        </div>

        <div className="flex flex-col items-center gap-3 max-w-[90vw]">
          <h1 className="text-[20px] sm:text-[22px] font-normal leading-snug text-white">
            Sua conta do <span className="font-semibold text-white">Discord</span> foi conectada a{" "}
            <span className="font-semibold text-white">Wyze Bank</span>
          </h1>
          {sessionUser?.username ? (
            <p className="text-[14px] leading-relaxed text-white/70">
              Usuário: <span className="text-white">{sessionUser.username}</span>
            </p>
          ) : null}
          <p className="text-[15px] leading-relaxed text-white/60 max-w-[350px] mx-auto">
            Você pode fechar esta janela e voltar para o Discord.
          </p>
        </div>
      </section>

      <footer
        className="
          relative z-10 mt-16 w-full max-w-[420px]
          flex flex-col items-center text-center text-[12px] leading-relaxed text-white/40
        "
      >
        <div className="h-px w-full max-w-[600px] bg-white/5 mb-4" />
        <p className="max-w-[450px]">
          Todos os direitos reservados ® 2025 Wyze Bank. Ao continuar, você concorda com nossos{" "}
          <a
            href="https://support.wyzecode.com/docs/terms-service"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white/70 transition-colors"
          >
            Termos de Serviço
          </a>{" "}
          e{" "}
          <a
            href="https://support.wyzecode.com/docs/policy-politic"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white/70 transition-colors"
          >
            Política de Privacidade
          </a>
          .
        </p>
      </footer>
    </main>
  );
}
