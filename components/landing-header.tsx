"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Menu, X } from "lucide-react"

export function LandingHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 z-50 w-full transition-all duration-300 ${
        scrolled ? "border-b border-white/10 bg-black/95 backdrop-blur-xl" : "bg-transparent"
      }`}
    >
      <div className="container mx-auto px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <img
              src="/Clyze_Logo/icon_green_black.png"
              alt="Clyze"
              className="h-9 w-9 transition-transform group-hover:scale-110"
            />
            <span className="text-xl font-semibold text-white">Clyze</span>
          </Link>

          <nav className="hidden md:flex items-center gap-10">
            <Link href="#product" className="text-sm text-zinc-400 hover:text-white transition-colors font-medium">
              Product
            </Link>
            <Link href="#features" className="text-sm text-zinc-400 hover:text-white transition-colors font-medium">
              Features
            </Link>
            <Link href="#solutions" className="text-sm text-zinc-400 hover:text-white transition-colors font-medium">
              Solutions
            </Link>
            <Link href="#docs" className="text-sm text-zinc-400 hover:text-white transition-colors font-medium">
              Docs
            </Link>
            <Link href="#pricing" className="text-sm text-zinc-400 hover:text-white transition-colors font-medium">
              Pricing
            </Link>
          </nav>

          <div className="hidden md:flex items-center gap-4">
            <Button
              variant="ghost"
              asChild
              className="text-sm text-zinc-400 hover:text-white hover:bg-white/5 font-medium"
            >
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild className="cback text-black hover:opacity-90 text-sm font-semibold px-6">
              <Link href="/login">Get Started</Link>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-white hover:bg-white/5 rounded-lg transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden py-8 space-y-6 border-t border-white/10 animate-fadeIn">
            <Link
              href="#product"
              className="block py-3 text-base text-zinc-400 hover:text-white transition-colors font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              Product
            </Link>
            <Link
              href="#features"
              className="block py-3 text-base text-zinc-400 hover:text-white transition-colors font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              Features
            </Link>
            <Link
              href="#solutions"
              className="block py-3 text-base text-zinc-400 hover:text-white transition-colors font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              Solutions
            </Link>
            <Link
              href="#docs"
              className="block py-3 text-base text-zinc-400 hover:text-white transition-colors font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              Docs
            </Link>
            <Link
              href="#pricing"
              className="block py-3 text-base text-zinc-400 hover:text-white transition-colors font-medium"
              onClick={() => setMobileMenuOpen(false)}
            >
              Pricing
            </Link>
            <div className="pt-6 space-y-4 border-t border-white/10">
              <Button
                variant="outline"
                asChild
                className="w-full border-white/20 text-white hover:bg-white/5 bg-transparent h-12 text-base font-medium"
              >
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild className="w-full cback text-black hover:opacity-90 h-12 text-base font-semibold">
                <Link href="/login">Get Started</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
