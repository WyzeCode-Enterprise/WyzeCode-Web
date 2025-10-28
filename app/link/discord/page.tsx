"use client";

import React from "react";

type DiscordLinkedUser = {
  id: string;
  username: string;
  avatar?: string | null;
};



export default function DiscordLinkPage() {
  const [loading, setLoading] = React.useState(true);
  const [sessionUser, setSessionUser] = React.useState<DiscordLinkedUser | null>(null);

  React.useEffect(() => {
    try {
      // apaga o cookie de pós-login assim que chegarmos aqui
      document.cookie = "wzb_postlogin_redirect=; Path=/; Max-Age=0; SameSite=Lax;";
    } catch {}
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function finalizeWithCode(oauthCode: string) {
      try {
        const res = await fetch("/api/discord-vn", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ code: oauthCode }),
        });

        const data = await res.json();
        if (cancelled) return;

        // precisa logar Wyze antes?
        if (data?.needLogin && data?.loginUrl) {
          window.location.href = data.loginUrl;
          return;
        }

        if (!data?.success) {
          console.error("Falha ao finalizar OAuth Discord:", data?.error);
          await checkSession();
          return;
        }

        if (data.user) {
          setSessionUser(data.user);
        }

        // limpa ?code e ?state da URL sem reload
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("code");
        cleanUrl.searchParams.delete("state");
        window.history.replaceState({}, "", cleanUrl.toString());

        setLoading(false);
      } catch (err) {
        console.error("Erro no finalizeWithCode:", err);
        await checkSession();
      }
    }

    async function checkSession() {
      try {
        const res = await fetch("/api/discord-vn", {
          method: "GET",
          credentials: "include",
        });
        const data = await res.json();
        if (cancelled) return;

        // usuário nem logado no Wyze
        if (data?.needLogin && data?.loginUrl) {
          window.location.href = data.loginUrl;
          return;
        }

        // usuário logado Wyze mas ainda não vinculou Discord:
        // manda direto pro Discord OAuth
        if (!data.ready && data.discordAuthUrl) {
          window.location.href = data.discordAuthUrl;
          return;
        }

        // usuário já vinculado
        if (data.ready) {
          setSessionUser(data.user || null);
          setLoading(false);
          return;
        }

        console.error("Fluxo Discord inesperado:", data);
      } catch (e) {
        console.error("erro checando sessão discord", e);
        // se deu ruim geral, poderia mostrar erro custom aqui ao invés do skeleton infinito
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

  // LOADING / SKELETON
  if (loading) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center bg-black text-white px-6 overflow-hidden antialiased">
              <div
        className="
          pointer-events-none
          absolute
          top-[-200px]
          left-1/2
          -translate-x-1/2
          h-[480px]
          w-[900px]
          rounded-[999px]
          blur-[120px]
          opacity-[0.28]
          bg-[radial-gradient(ellipse_at_center,rgba(88,101,242,0.55)_0%,rgba(38,255,89,0.18)_40%,rgba(0,0,0,0)_70%)]
        "
        aria-hidden="true"
      />

      {/* gradiente vertical suave reforçando a luz no topo */}
      <div
        className="
          pointer-events-none
          absolute
          top-0
          left-0
          right-0
          h-[100vh]
          bg-[radial-gradient(circle_at_top,rgba(88,101,242,0.22)_0%,rgba(0,0,0,0)_70%)]
          opacity-70
        "
        aria-hidden="true"
      />

        {/* glow inclinado central em modo skeleton (apagado) */}
        <div
          className="
            pointer-events-none
            absolute
            left-1/2
            top-1/2
            -translate-x-1/2
            -translate-y-1/2
            h-[600px]
            w-[1200px]
            rounded-[999px]
            blur-[160px]
            opacity-[0.12]
            rotate-[15deg]
            bg-[radial-gradient(ellipse_at_center,
              rgba(80,80,80,0.4)_0%,
              rgba(30,30,30,0.15)_40%,
              rgba(0,0,0,0)_70%
            )]
          "
        />

        {/* layers premium de fundo */}
        <div className="pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-screen [background-size:3px_3px]" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-size:40px_40px]" />

        {/* card skeleton */}
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

        {/* footer skeleton */}
        <footer className="relative z-10 mt-16 w-full max-w-[420px] flex flex-col items-center text-center text-[12px] leading-relaxed text-white/40">
          <div className="h-px w-full max-w-[600px] bg-white/5 mb-4" />
          <div className="h-3 w-[320px] rounded bg-white/5 animate-pulse" />
        </footer>
      </main>
    );
  }

   return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-black text-white px-6 overflow-hidden antialiased">

      {/* ===== SUPER GLOW IA NO TOPO ===== */}
      {/* faixa de luz gigante descendo do topo (aurora) */}
      <div
        className="
          pointer-events-none
          absolute
          top-[-200px]
          left-1/2
          -translate-x-1/2
          h-[480px]
          w-[900px]
          rounded-[999px]
          blur-[120px]
          opacity-[0.28]
          bg-[radial-gradient(ellipse_at_center,rgba(88,101,242,0.55)_0%,rgba(38,255,89,0.18)_40%,rgba(0,0,0,0)_70%)]
        "
        aria-hidden="true"
      />

      {/* gradiente vertical suave reforçando a luz no topo */}
      <div
        className="
          pointer-events-none
          absolute
          top-0
          left-0
          right-0
          h-[100vh]
          bg-[radial-gradient(circle_at_top,rgba(88,101,242,0.22)_0%,rgba(0,0,0,0)_70%)]
          opacity-70
        "
        aria-hidden="true"
      />

      {/* ===== VIGNETTE E TEXTURA ===== */}

      {/* Vignette radial escura pra dar foco no centro */}
      <div
        className="
          pointer-events-none
          absolute inset-0
          bg-[radial-gradient(circle_at_center,rgba(0,0,0,0)_0%,rgba(0,0,0,0.6)_70%)]
          opacity-60
        "
        aria-hidden="true"
      />

      {/* Ruído sutil (textura SaaS premium) */}
      <div
        className="
          pointer-events-none
          absolute inset-0
          opacity-[0.07]
          mix-blend-screen
          [background-image:radial-gradient(circle_at_center,rgba(255,255,255,0.12)_0.5px,rgba(0,0,0,0)_1px)]
          [background-size:3px_3px]
        "
        aria-hidden="true"
      />

      {/* Grid técnico bem discreto */}
      <div
        className="
          pointer-events-none
          absolute inset-0
          opacity-[0.035]
          [background-image:repeating-linear-gradient(0deg,rgba(255,255,255,0.12)_0px,rgba(255,255,255,0.0)_1px,transparent_1px,transparent_40px),
                            repeating-linear-gradient(90deg,rgba(255,255,255,0.12)_0px,rgba(255,255,255,0.0)_1px,transparent_1px,transparent_40px)]
          [background-size:40px_40px]
        "
        aria-hidden="true"
      />

      {/* ===== GOOGLE ADSENSE / META ===== */}
      <meta
        name="google-adsense-account"
        content="ca-pub-9885448378379221"
      ></meta>

      {/* ===== CARD CENTRAL (CONTEÚDO) ===== */}
      <section
        className="
          relative z-10
          flex flex-col items-center text-center gap-6
          w-full max-w-[600px]
          rounded-xl
          backdrop-blur-md
          px-6 py-8
        "
      >
        {/* bloco das logos */}
        <div className="relative flex items-center gap-6">
          {/* halo local atrás das duas logos */}
          <div
            className="
              absolute -inset-8
              pointer-events-none
              rounded-[24px]
              bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.10)_0%,rgba(0,0,0,0)_70%)]
              opacity-70
              blur-2xl
            "
            aria-hidden="true"
          />

          {/* Logo Discord / sua marca branca */}
          <img
            src="https://wyzebank.com/lg_files_wb/png_files/isotipo_white.png"
            alt="Discord"
            className="relative h-[60px] w-auto"
          />

          {/* + */}
          <span className="relative text-[#26FF59] text-3xl font-medium leading-none select-none">
            +
          </span>

          {/* Logo Wyze Bank */}
          <img
            src="https://wyzebank.com/lg_files_wb/wzc_imgs/v1/66e3d7f4ef6498ac018f2c55_Symbol.svg"
            alt="Wyze Bank"
            className="relative h-[52px] w-auto"
          />
        </div>

        {/* Texto principal */}
        <div className="flex flex-col items-center gap-3 max-w-[90vw]">
          <h1 className="text-[20px] sm:text-[22px] font-normal leading-snug text-white">
            Sua conta do{" "}
            <span className="font-semibold text-white">Discord</span> foi
            conectada a{" "}
            <span className="font-semibold text-white">Wyze Bank</span>
          </h1>

          <p className="text-[15px] leading-relaxed text-white/60 max-w-[350px] mx-auto">
            Você pode fechar esta janela e voltar para o Discord.
          </p>
        </div>
      </section>

      {/* ===== RODAPÉ / TERMOS ===== */}
      <footer
        className="
          relative z-10
          mt-16 w-full max-w-[420px]
          flex flex-col items-center
          text-center text-[12px] leading-relaxed text-white/40
        "
      >
        {/* linha separadora suave */}
        <div className="h-px w-full max-w-[600px] bg-white/5 mb-4" />

        <p className="max-w-[450px]">
          Todos os direitos reservados ® 2025 Wyze Bank. Ao continuar, você
          concorda com nossos{" "}
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
