"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  const router = useRouter();

  // booting: true => estamos tentando reaproveitar sessão existente
  // showForm: true => deve mostrar o formulário de login
  const [booting, setBooting] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // helper pra cair no modo "mostrar formulário"
    function fallbackToForm() {
      if (cancelled) return;
      setShowForm(true);
      setBooting(false);
    }

    async function tryAutoLogin() {
      // safety timeout pra não travar a tela se a API nunca responde
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const res = await fetch("/api/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: "",
            password: "",
            next: null,
          }),
          credentials: "include",
          signal: controller.signal,
        });

        // tenta parsear json; se falhar, cai pro formulário
        let data: any = {};
        try {
          data = await res.json();
        } catch {
          // resposta não era json -> não tem sessão válida
          return fallbackToForm();
        }

        // caso feliz: backend disse "já tinha sessão e eu só reaproveitei"
        if (
          res.ok &&
          data?.success === true &&
          data?.reusedSession === true &&
          typeof data?.redirect === "string" &&
          data.redirect.length > 0
        ) {
          if (!cancelled) {
            router.push(data.redirect);
          }
          return;
        }

        // qualquer outra coisa -> precisa logar manualmente
        fallbackToForm();
      } catch (err) {
        // abort, erro de rede, 500 etc -> mostra form
        fallbackToForm();
      } finally {
        clearTimeout(timeout);
      }
    }

    tryAutoLogin();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div
      className="
        relative
        overflow-hidden
        bg-background text-foreground
        flex min-h-screen flex-col items-center justify-center
        gap-6 p-6 md:p-10
      "
    >
      {/* Glow grande no topo */}
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
          opacity-10
          bg-[radial-gradient(ellipse_at_center,rgba(88,101,242,0.55)_0%,rgba(38,255,89,0.18)_40%,rgba(0,0,0,0)_70%)]
        "
        aria-hidden="true"
      />

      {/* Gradiente vertical */}
      <div
        className="
          pointer-events-none
          absolute
          top-0
          left-0
          right-0
          h-[100vh]
          bg-[radial-gradient(circle_at_top,rgba(88,101,242,0.22)_0%,rgba(0,0,0,0)_70%)]
          opacity-30
        "
        aria-hidden="true"
      />

      <div className="w-full max-w-[450px]">
        {booting && !showForm ? (
          <div className="text-center text-sm text-muted-foreground">
            Aguarde, estamos validando sua sessão...
          </div>
        ) : (
          <LoginForm />
        )}
      </div>
    </div>
  );
}
