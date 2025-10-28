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
        });

        const data = await res.json().catch(() => ({}));

        // sessão já válida → manda direto pro redirect
        if (res.ok && data?.success && data?.redirect && data?.reusedSession) {
          if (!cancelled) {
            router.push(data.redirect);
          }
          return;
        }

        // precisa logar normalmente
        if (!cancelled) {
          setShowForm(true);
          setBooting(false);
        }
      } catch {
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

  return (
    <div
      className="
        relative            /* <- âncora pros absolutes */
        overflow-hidden     /* <- corta o glow que sai pra fora da viewport */
        bg-background text-foreground
        flex min-h-screen flex-col items-center justify-center
        gap-6 p-6 md:p-10
      "
    >
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
          opacity-10
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
          opacity-30
        "
        aria-hidden="true"
      />

      <div className="w-full max-w-[450px]">
        {booting && !showForm ? (
          <div className="text-sm text-muted-foreground text-center">
            Aguarde estamos validando seu login...
          </div>
        ) : (
          <LoginForm />
        )}
      </div>
    </div>
  );
}
