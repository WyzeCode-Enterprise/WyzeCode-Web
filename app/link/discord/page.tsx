import React from "react";
import Script from "next/script";
import { SpeedInsights } from "@vercel/speed-insights/next";

export default function Page() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-black text-white px-6">
      {/* Adsense (mantido do seu código original) */}
      <meta
        name="google-adsense-account"
        content="ca-pub-9885448378379221"
      ></meta>
      <Script
        id="adsense-script-403"
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9885448378379221"
        crossOrigin="anonymous"
      />

      {/* Conteúdo principal */}
      <section className="flex flex-col items-center text-center gap-8">
        {/* Glow de fundo suave atrás do bloco das logos */}
        <div className="relative flex items-center gap-6">
          <div
            className="
      absolute -inset-8 pointer-events-none rounded-[24px]
      bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08)_0%,rgba(0,0,0,0)_70%)]
      opacity-70 blur-2xl
    "
            aria-hidden="true"
          />

          <img
            src="https://wyzebank.com/lg_files_wb/png_files/isotipo_white.png"
            alt="Discord"
            className="relative h-15"
          />

          <span className="relative text-[#5865F2] text-3xl font-medium leading-none select-none">
            +
          </span>

          <img
            src="https://wyzebank.com/lg_files_wb/wzc_imgs/v1/66e3d7f4ef6498ac018f2c55_Symbol.svg"
            alt="Discord"
            className="relative h-15"
          />
        </div>

        {/* Texto */}
        <div className="flex flex-col items-center gap-3 max-w-[90vw]">
          <h1 className="text-[20px] sm:text-[22px] font-normal leading-snug text-white">
            Sua conta do{" "}
            <span className="font-semibold text-white">Discord</span> foi
            conectada a{" "}
            <span className="font-semibold text-white">Wyze Bank</span>
          </h1>

          <p className="text-[15px] leading-relaxed text-white/60 max-w-[360px]">
            Você pode fechar esta janela e voltar para o Discord.
          </p>
        </div>
      </section>

      {/* Rodapé legal / termos */}
      <footer
        className="
          mt-20 w-full max-w-[420px]
          text-center text-[12px] leading-relaxed text-white/40
          flex flex-col items-center
        "
      >
        {/* linha separadora bem suave pra dar sensação de bloco fechado */}
        <div className="h-px w-full max-w-[260px] bg-white/5 mb-4" />

        <p className="max-w-[360px]">
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

      {/* analytics/vercel */}
      <SpeedInsights />
    </main>
  );
}
