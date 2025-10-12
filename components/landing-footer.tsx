import Link from "next/link"
import { Github, Twitter, Linkedin, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function LandingFooter() {
  return (
    <footer className="relative bg-black border-t border-white/10">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-green-500/50 to-transparent" />

      <div className="container mx-auto px-6 lg:px-8 py-20">

        <div className="grid grid-cols-2 md:grid-cols-5 gap-12 mb-16">
          <div className="col-span-2 space-y-6">
            <Link href="/" className="flex items-center gap-3 group">
              <img
                src="/Clyze_Logo/icon_green_black.png"
                alt="Clyze"
                className="h-10 w-10 transition-transform group-hover:scale-110"
              />
              <span className="text-2xl font-bold text-white">Clyze</span>
            </Link>
            <p className="text-base text-zinc-400 leading-relaxed max-w-xs">
              Unified operational intelligence platform for modern enterprises. Make faster, data-driven decisions.
            </p>
            <div className="flex items-center gap-4 pt-2">
              <Link
                href="#"
                className="text-zinc-500 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg"
              >
                <Github className="size-5" />
              </Link>
              <Link
                href="#"
                className="text-zinc-500 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg"
              >
                <Twitter className="size-5" />
              </Link>
              <Link
                href="#"
                className="text-zinc-500 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg"
              >
                <Linkedin className="size-5" />
              </Link>
              <Link
                href="#"
                className="text-zinc-500 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg"
              >
                <Mail className="size-5" />
              </Link>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-5 text-sm uppercase tracking-wider">Product</h3>
            <ul className="space-y-3">
              <li>
                <Link href="#features" className="text-sm text-zinc-400 hover:text-white transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link href="#integrations" className="text-sm text-zinc-400 hover:text-white transition-colors">
                  Integrations
                </Link>
              </li>
              <li>
                <Link href="#pricing" className="text-sm text-zinc-400 hover:text-white transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="#changelog" className="text-sm text-zinc-400 hover:text-white transition-colors">
                  Changelog
                </Link>
              </li>
              <li>
                <Link href="#roadmap" className="text-sm text-zinc-400 hover:text-white transition-colors">
                  Roadmap
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-5 text-sm uppercase tracking-wider">Resources</h3>
            <ul className="space-y-3">
              <li>
                <Link href="#docs" className="text-sm text-zinc-400 hover:text-white transition-colors">
                  Documentation
                </Link>
              </li>
              <li>
                <Link href="#api" className="text-sm text-zinc-400 hover:text-white transition-colors">
                  API Reference
                </Link>
              </li>
              <li>
                <Link href="#guides" className="text-sm text-zinc-400 hover:text-white transition-colors">
                  Guides
                </Link>
              </li>
              <li>
                <Link href="#blog" className="text-sm text-zinc-400 hover:text-white transition-colors">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="#support" className="text-sm text-zinc-400 hover:text-white transition-colors">
                  Support
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-5 text-sm uppercase tracking-wider">Company</h3>
            <ul className="space-y-3">
              <li>
                <Link href="#about" className="text-sm text-zinc-400 hover:text-white transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="#careers" className="text-sm text-zinc-400 hover:text-white transition-colors">
                  Careers
                </Link>
              </li>
              <li>
                <Link href="#customers" className="text-sm text-zinc-400 hover:text-white transition-colors">
                  Customers
                </Link>
              </li>
              <li>
                <Link href="#partners" className="text-sm text-zinc-400 hover:text-white transition-colors">
                  Partners
                </Link>
              </li>
              <li>
                <Link href="#contact" className="text-sm text-zinc-400 hover:text-white transition-colors">
                  Contact
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-10 border-t border-white/10 flex flex-col lg:flex-row items-center justify-between gap-6">
          <p className="text-sm text-zinc-500">© 2025 Clyze LTDA. All rights reserved.</p>
          <div className="flex items-center gap-8">
            <Link href="#privacy" className="text-sm text-zinc-500 hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link href="#terms" className="text-sm text-zinc-500 hover:text-white transition-colors">
              Terms of Service
            </Link>
            <Link href="#security" className="text-sm text-zinc-500 hover:text-white transition-colors">
              Security
            </Link>
            <Link href="#cookies" className="text-sm text-zinc-500 hover:text-white transition-colors">
              Cookie Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
