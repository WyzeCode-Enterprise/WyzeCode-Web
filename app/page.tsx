import React from "react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Página Inicial",
  description: "Esta é uma página genérica do Next.js 13+"
};

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 select-none">
      <div className="text-center p-8 bg-white shadow-md rounded-lg max-w-xl">
        <h1 className="text-gray-900 text-4xl font-bold mb-4">Bem-vindo a Wyze Bank!</h1>
        <p className="text-lg text-gray-600">
          Você não possui permição para acessar esta página. Por favor, entre em contato com o administrador do sistema caso ache que isso é um erro. 
        </p>
      </div>
    </main>
  );
}
