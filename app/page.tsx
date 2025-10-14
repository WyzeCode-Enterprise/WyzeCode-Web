// app/page.tsx
import React from "react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Página Inicial",
  description: "Esta é uma página genérica do Next.js 13+"
};

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="text-center p-8 bg-white shadow-md rounded-lg">
        <h1 className="text-4xl font-bold mb-4">Bem-vindo ao Next.js!</h1>
        <p className="text-lg text-gray-700">
          Esta é uma página genérica pronta para você personalizar.
        </p>
      </div>
    </main>
  );
}
