export function LandingShowcase() {
  return (
    <section className="relative py-40 bg-black overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(38,255,89,0.08)_0%,_transparent_60%)]" />

      <div className="container relative mx-auto px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center mb-20">
          <h2 className="text-5xl lg:text-7xl font-bold text-white mb-8 leading-tight">
            Built for modern
            <br />
            <span className="ccolor">operations</span>
          </h2>
          <p className="text-xl text-zinc-400 leading-relaxed max-w-2xl mx-auto">
            Experience real-time operational intelligence with our unified platform designed for enterprise scale.
          </p>
        </div>

        <div className="relative max-w-6xl mx-auto">
          <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-zinc-950/50 backdrop-blur-sm shadow-2xl">
            <div className="aspect-video bg-gradient-to-br from-zinc-900 via-black to-zinc-900 flex items-center justify-center">
              <img
                src="https://placeholder.svg?height=800&width=1400&text=Dashboard+Preview"
                alt="Platform Dashboard"
                className="w-full h-full object-cover opacity-80"
              />
            </div>
          </div>
          <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/20 via-green-500/20 to-blue-500/20 blur-3xl -z-10 opacity-50" />
        </div>
      </div>
    </section>
  )
}
