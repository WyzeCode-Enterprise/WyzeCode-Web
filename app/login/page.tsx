"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  const router = useRouter();

  // booting: true = ainda tentando autologin silencioso
  // showForm: true = deve renderizar o formulário
  const [booting, setBooting] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function tryAutoLogin() {
      try {
        // Faz o POST sem body pra ativar o bloco 0. AUTOLOGIN PELO COOKIE
        // no backend. Se a sessão já existe (wzb_lg válido),
        // ele vai responder { success: true, redirect: "...", reusedSession: true }
        const res = await fetch("/api/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          // manda body vazio pra cair no autologin.
          // o backend tenta ler req.json() depois do autologin,
          // então aqui já mandamos um JSON com campos vazios pra não quebrar.
          body: JSON.stringify({
            email: "",
            password: "",
            next: null,
          }),
          credentials: "include",
        });

        const data = await res.json().catch(() => ({}));

        // Caso 1: sessão já era válida
        if (res.ok && data?.success && data?.redirect && data?.reusedSession) {
          if (!cancelled) {
            router.push(data.redirect);
          }
          return;
        }

        // Caso 2: servidor respondeu "needPassword", "newUser", etc
        // ou 401, ou qualquer coisa que não seja reusedSession
        if (!cancelled) {
          setShowForm(true);
          setBooting(false);
        }
      } catch {
        // se der erro de rede etc, cai pro formulário normal
        if (!cancelled) {
          setShowForm(true);
          setBooting(false);
        }
      }
    }

    tryAutoLogin();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Enquanto está verificando sessão, você pode mostrar um loading simples.
  // Depois, se não tem sessão, mostra o LoginForm.
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="w-full max-w-[450px]">
        {booting && !showForm ? (
          <div className="text-sm text-muted-foreground text-center">
            Validando login...
          </div>
        ) : (
          <LoginForm />
        )}
      </div>
    </div>
  );
}
