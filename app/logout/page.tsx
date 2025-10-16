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
      <p>Saindo...</p>
    </div>
  )
}
