import { Database, Zap, Shield, BarChart3, Globe } from "lucide-react"

export function LandingBento() {
  return (
    <section className="relative py-32 bg-black overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(59,130,246,0.05)_0%,_transparent_50%)]" />

      <div className="container relative mx-auto px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-bold text-white mb-6">Built for scale</h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
              Enterprise-grade infrastructure designed to handle millions of operations per second
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Large card */}
            <div className="md:col-span-2 md:row-span-2 bg-zinc-950/50 border border-white/10 rounded-2xl p-8 hover:border-white/20 transition-colors">
              <Database className="w-12 h-12 text-white mb-6" />
              <h3 className="text-3xl font-bold text-white mb-4">Unified Data Layer</h3>
              <p className="text-zinc-400 text-lg leading-relaxed">
                Connect all your enterprise systems in one place. Real-time synchronization across production, sales,
                inventory, HR, and IoT platforms.
              </p>
              <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="bg-black/50 rounded-lg p-4 border border-white/5">
                  <p className="text-2xl font-bold text-white">99.99%</p>
                  <p className="text-sm text-zinc-500">Uptime SLA</p>
                </div>
                <div className="bg-black/50 rounded-lg p-4 border border-white/5">
                  <p className="text-2xl font-bold text-white">100ms</p>
                  <p className="text-sm text-zinc-500">Response Time</p>
                </div>
              </div>
            </div>

            {/* Small cards */}
            <div className="bg-zinc-950/50 border border-white/10 rounded-2xl p-8 hover:border-white/20 transition-colors">
              <Zap className="w-10 h-10 text-white mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Real-time Processing</h3>
              <p className="text-zinc-400">Process millions of events per second with sub-millisecond latency</p>
            </div>

            <div className="bg-zinc-950/50 border border-white/10 rounded-2xl p-8 hover:border-white/20 transition-colors">
              <Shield className="w-10 h-10 text-white mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Enterprise Security</h3>
              <p className="text-zinc-400">SOC 2 Type II, ISO 27001, and GDPR compliant infrastructure</p>
            </div>

            <div className="bg-zinc-950/50 border border-white/10 rounded-2xl p-8 hover:border-white/20 transition-colors">
              <BarChart3 className="w-10 h-10 text-white mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">AI Analytics</h3>
              <p className="text-zinc-400">Predictive insights powered by advanced machine learning models</p>
            </div>

            <div className="md:col-span-2 bg-zinc-950/50 border border-white/10 rounded-2xl p-8 hover:border-white/20 transition-colors">
              <Globe className="w-10 h-10 text-white mb-4" />
              <h3 className="text-2xl font-bold text-white mb-2">Global Infrastructure</h3>
              <p className="text-zinc-400 text-lg">
                Deployed across 25+ regions worldwide with automatic failover and disaster recovery
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
