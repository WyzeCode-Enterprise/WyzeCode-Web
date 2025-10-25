import React from "react";
import Script from "next/script";
import { SpeedInsights } from "@vercel/speed-insights/next";

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 select-none relative">
      <Script
        id="adsense-script-403"
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9885448378379221"
        crossOrigin="anonymous"
      />

      <div className="text-center p-8 bg-white shadow-md rounded-lg max-w-xl">
        <h1 className="text-gray-900 text-4xl font-bold mb-4">403</h1>
        <p className="text-lg text-gray-600">
          Você não possui permissão para acessar esta página. Por favor,
          entre em contato com o administrador do sistema caso ache que isso é um erro.
        </p>
      </div>

      <SpeedInsights />
    </main>
  );
}