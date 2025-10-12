export function LandingHowItWorks() {
  return (
    <section id="how-it-works" className="py-32 lg:py-40 bg-zinc-950">
      <div className="container mx-auto px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-6 mb-20">
            <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-white">How it works</h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
              From fragmented data to unified intelligence in minutes.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            <div className="space-y-4">
              <div className="text-6xl font-bold ccolor">01</div>
              <h3 className="text-2xl font-semibold text-white">Connect</h3>
              <p className="text-zinc-400 leading-relaxed">
                Integrate your existing systems via API. No migration, no downtime.
              </p>
            </div>

            <div className="space-y-4">
              <div className="text-6xl font-bold ccolor">02</div>
              <h3 className="text-2xl font-semibold text-white">Analyze</h3>
              <p className="text-zinc-400 leading-relaxed">
                AI learns your patterns and detects anomalies in real-time across all operations.
              </p>
            </div>

            <div className="space-y-4">
              <div className="text-6xl font-bold ccolor">03</div>
              <h3 className="text-2xl font-semibold text-white">Optimize</h3>
              <p className="text-zinc-400 leading-relaxed">
                Get predictive insights and automated actions to prevent issues before they happen.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
