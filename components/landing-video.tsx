import { Play } from "lucide-react"
import { Button } from "@/components/ui/button"

export function LandingVideo() {
  return (
    <section className="relative py-32 bg-black overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(38,255,89,0.05)_0%,_transparent_50%)]" />

      <div className="container relative mx-auto px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-5xl md:text-6xl font-bold text-white mb-6">See it in action</h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
              Watch how O.I. Cloud transforms enterprise operations in minutes
            </p>
          </div>

          <div className="relative group cursor-pointer">
            <div className="absolute -inset-1 bg-gradient-to-r from-green-500/20 to-blue-500/20 rounded-3xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity" />
            <div className="relative rounded-2xl border border-white/10 bg-zinc-950/50 backdrop-blur-sm p-2 overflow-hidden">
              <div className="aspect-video bg-gradient-to-br from-zinc-900 via-zinc-950 to-black rounded-xl flex items-center justify-center">
                <Button
                  size="lg"
                  className="w-20 h-20 rounded-full cback text-black hover:scale-110 transition-transform"
                >
                  <Play className="w-8 h-8 ml-1" fill="currentColor" />
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-8 mt-12 text-center">
            <div>
              <p className="text-3xl font-bold text-white mb-2">5 min</p>
              <p className="text-sm text-zinc-500">Setup time</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-white mb-2">Zero</p>
              <p className="text-sm text-zinc-500">Code required</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-white mb-2">24/7</p>
              <p className="text-sm text-zinc-500">Support included</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
