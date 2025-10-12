import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

export function LandingCTA() {
  return (
    <section className="relative py-40 bg-black overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(59,130,246,0.1)_0%,_transparent_70%)]" />

      <div className="container relative mx-auto px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center space-y-10">
          <h2 className="text-6xl lg:text-8xl font-bold text-white leading-tight">
            Ready to transform
            <br />
            your operations?
          </h2>
          <p className="text-xl lg:text-2xl text-zinc-400 leading-relaxed max-w-2xl mx-auto">
            Join hundreds of enterprises already using O.I. Cloud to make faster, smarter decisions.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
            <Button
              asChild
              size="lg"
              className="cback text-black hover:opacity-90 text-base font-semibold px-8 h-14 group"
            >
              <Link href="/login">
                Start Free Trial
                <ArrowRight className="ml-2 size-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/20 text-white hover:bg-white/5 bg-transparent text-base font-semibold px-8 h-14"
            >
              <Link href="#contact">Talk to Sales</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
