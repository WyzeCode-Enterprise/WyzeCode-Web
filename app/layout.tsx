import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script"; // <--- ADICIONADO
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans2",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono2",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wyze Bank • O Melhor Banco Digital e Plataforma de Pagamentos Inteligentes",
  description:
    "Wyze Bank é um banco digital completo com soluções de pagamentos integradas, tecnologia avançada e segurança máxima para empresas e clientes gerenciarem suas finanças com eficiência.",
  icons: {
    icon: "https://www.wyzebank.com/lg_files_wb/svg_files/icon_green_black.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="icon"
          type="image/png"
          href="https://www.wyzebank.com/lg_files_wb/svg_files/icon_green_black.svg"
        />

        <Script
          id="adsense-script"
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9885448378379221"
          crossOrigin="anonymous"
        />
      </head>

      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
