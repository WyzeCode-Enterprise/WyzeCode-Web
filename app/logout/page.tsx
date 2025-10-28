"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function LogoutPage() {
  const router = useRouter()

  useEffect(() => {
    fetch("/api/logout") // chama o Route Handler da API
      .finally(() => router.replace("/login"))
  }, [router])

  return (
    <div className="flex items-center justify-center h-screen bg-black text-white">
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
      
      <p>Saindo...</p>
    </div>
  )
}
