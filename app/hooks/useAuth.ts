"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function useAuth() {
  const router = useRouter();

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Faz uma requisição para a rota de validação do cookie
        const res = await fetch("/api/auth/validate", { cache: "no-store" });

        if (!res.ok) {
          router.replace("/login"); // redireciona imediatamente
        }
      } catch (err) {
        router.replace("/login");
      }
    };

    checkAuth();
  }, [router]);
}
