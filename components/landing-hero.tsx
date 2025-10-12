"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"

export function LandingHero() {
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setCursorPosition({ x: e.clientX, y: e.clientY })
    }
    window.addEventListener("mousemove", handleMouseMove)
    return () => window.removeEventListener("mousemove", handleMouseMove)
  }, [])

  return (
    <section className="relative pt-32 pb-24 md:pt-40 md:pb-32 overflow-hidden bg-black">
      <div
        className="pointer-events-none fixed inset-0 z-30 transition-opacity duration-300"
      />

      <div className="absolute inset-0 bg-black" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[800px] bg-blue-600/5 rounded-full blur-[150px]" />
      <div className="absolute top-1/4 right-0 w-[600px] h-[600px] bg-green-500/5 rounded-full blur-[120px]" />

      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: "100px 100px",
        }}
      />

      <div className="container mx-auto px-6 lg:px-8 relative z-10">
        <div className="max-w-5xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm">
            <div className="w-2 h-2 rounded-full cback animate-pulse" />
            <span className="text-xs text-zinc-400 font-medium">Unified Operational Intelligence Platform</span>
          </div>

          <h1 className="text-6xl md:text-7xl lg:text-8xl xl:text-9xl font-bold tracking-tight text-white leading-[1.05]">
            Intelligence that
            <br />
            <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              drives decisions
            </span>
          </h1>

          <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            O.I. Cloud unifies enterprise data from production, sales, inventory, HR, and IoT systems. AI-powered
            insights detect anomalies and predict outcomes in real-time.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
            <Button asChild size="lg" className="cback text-black hover:opacity-90 h-12 px-8 text-base font-medium">
              <Link href="/login">Start building</Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="lg"
              className="h-12 px-8 text-base text-zinc-400 hover:text-white hover:bg-white/5 border border-white/10"
            >
              <Link href="#demo">View demo →</Link>
            </Button>
          </div>

          <div className="pt-20">
            <div className="relative rounded-2xl border border-white/10 bg-zinc-950/50 backdrop-blur-sm p-1 shadow-2xl">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-green-500/20 to-blue-500/20 rounded-2xl blur opacity-30" />
              <div className="relative rounded-xl bg-black p-8">
                <div className="aspect-video bg-gradient-to-br from-zinc-900 via-zinc-950 to-black rounded-lg flex items-center justify-center border border-white/5">
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-full border-2 border-white/10 flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full cback opacity-50" />
                    </div>
                    <p className="text-zinc-600 text-sm font-medium">Interactive Dashboard Preview</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
