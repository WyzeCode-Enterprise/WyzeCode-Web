"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function LandingNewsletter() {
  const [email, setEmail] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log("Subscribe:", email)
  }

  return (
    <section className="py-32 lg:py-40 bg-black relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-blue-600/10 rounded-full blur-[100px]" />

      <div className="container mx-auto px-6 lg:px-8 relative z-10">
        <div className="max-w-2xl mx-auto text-center space-y-8">
          <div className="flex justify-center">
            <img src="/Clyze_Logo/icon_green_black.png" alt="Clyze" className="h-16 w-16" />
          </div>

          <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-white">Stay in the loop</h2>

          <p className="text-xl text-zinc-400">
            Get insights on operational intelligence and enterprise AI delivered to your inbox.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto pt-4">
            <Input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 h-12 bg-white/5 border-white/10 focus:border-white/20 text-white placeholder:text-zinc-500"
              required
            />
            <Button type="submit" size="lg" className="cback text-black hover:opacity-90 h-12 px-8 font-medium">
              Subscribe
            </Button>
          </form>
        </div>
      </div>
    </section>
  )
}
