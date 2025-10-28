"use client";

import { useEffect } from "react";

export default function DiscordCallbackPage() {
  useEffect(() => {
    async function finishOAuth() {
      const code = new URLSearchParams(window.location.search).get("code");

      if (!code) {
        window.location.href = "/link/discord";
        return;
      }

      try {
        const res = await fetch("/api/discord-vn", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ code }),
        });

        const data = await res.json();

        if (data?.success && data?.redirect) {
          window.location.href = data.redirect;
        } else if (data?.needLogin && data?.loginUrl) {
          window.location.href = data.loginUrl;
        } else {
          window.location.href = "/link/discord";
        }
      } catch {
        window.location.href = "/link/discord";
      }
    }

    finishOAuth();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white px-6">
      <div className="text-center text-white/60 text-sm animate-pulse">
        Conectando sua conta do Discord...
      </div>
    </main>
  );
}
//.