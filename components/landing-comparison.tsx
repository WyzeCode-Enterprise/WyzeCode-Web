import { X, Check } from "lucide-react"

export function LandingComparison() {
  const comparisons = [
    {
      feature: "Data Visibility",
      before: "10+ disconnected dashboards",
      after: "One unified intelligent view",
    },
    {
      feature: "Decision Speed",
      before: "Days to analyze reports",
      after: "Real-time AI recommendations",
    },
    {
      feature: "Problem Detection",
      before: "Reactive after failures",
      after: "Predictive before issues occur",
    },
    {
      feature: "Integration Complexity",
      before: "Months of custom development",
      after: "Hours with pre-built connectors",
    },
    {
      feature: "Cost",
      before: "Multiple expensive tools",
      after: "One affordable platform",
    },
  ]

  return (
    <section className="relative py-32 bg-black overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(38,255,89,0.05)_0%,_transparent_50%)]" />

      <div className="container relative mx-auto px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center space-y-4 mb-20">
            <h2 className="text-5xl md:text-6xl font-bold text-white">
              Before vs After <span className="ccolor">O.I. Cloud</span>
            </h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
              See how enterprises transform their operations with unified intelligence
            </p>
          </div>

          <div className="space-y-4">
            {comparisons.map((item, index) => (
              <div
                key={index}
                className="grid md:grid-cols-3 gap-6 p-8 rounded-2xl border border-white/10 bg-zinc-950/50 backdrop-blur-sm hover:border-white/20 transition-all duration-300"
              >
                <div className="font-bold text-xl text-white flex items-center">{item.feature}</div>
                <div className="flex items-center gap-3 text-zinc-400">
                  <X className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <span>{item.before}</span>
                </div>
                <div className="flex items-center gap-3 text-white">
                  <Check className="w-5 h-5 ccolor flex-shrink-0" />
                  <span>{item.after}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
