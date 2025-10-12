import { Factory, ShoppingCart, Package, Users, TrendingUp, AlertTriangle } from "lucide-react"

export function LandingUseCases() {
  const useCases = [
    {
      icon: Factory,
      title: "Manufacturing Intelligence",
      description: "Monitor production lines, predict equipment failures, and optimize throughput in real-time.",
      metrics: ["15% efficiency gain", "30% less downtime"],
    },
    {
      icon: ShoppingCart,
      title: "Sales & Revenue Optimization",
      description: "Unify CRM, sales data, and market trends to forecast revenue and identify growth opportunities.",
      metrics: ["25% revenue increase", "Real-time forecasting"],
    },
    {
      icon: Package,
      title: "Supply Chain & Logistics",
      description: "Track inventory, predict stockouts, and optimize delivery routes with AI-powered logistics.",
      metrics: ["40% cost reduction", "99% on-time delivery"],
    },
    {
      icon: Users,
      title: "HR & Workforce Analytics",
      description: "Analyze employee performance, predict turnover, and optimize workforce allocation.",
      metrics: ["20% retention boost", "Automated scheduling"],
    },
    {
      icon: TrendingUp,
      title: "Financial Intelligence",
      description: "Consolidate financial data, detect anomalies, and generate automated compliance reports.",
      metrics: ["Real-time P&L", "Fraud detection"],
    },
    {
      icon: AlertTriangle,
      title: "Risk & Anomaly Detection",
      description: "AI monitors all systems 24/7 and alerts you to operational risks before they become critical.",
      metrics: ["Instant alerts", "Predictive warnings"],
    },
  ]

  return (
    <section className="py-24 lg:py-32 bg-muted/30">
      <div className="container mx-auto px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">Built For Every Department</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From production floors to executive boardrooms, O.I. Cloud delivers actionable intelligence across your
              entire organization.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {useCases.map((useCase, index) => (
              <div
                key={index}
                className="relative rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-8 hover:border-[#26ff59]/50 transition-all duration-300"
              >
                <div className="flex size-12 items-center justify-center rounded-lg bg-blue-600/20 mb-6">
                  <useCase.icon className="size-6 ccolor" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{useCase.title}</h3>
                <p className="text-muted-foreground leading-relaxed mb-4">{useCase.description}</p>
                <div className="flex flex-wrap gap-2">
                  {useCase.metrics.map((metric, i) => (
                    <span
                      key={i}
                      className="text-xs px-3 py-1 rounded-full bg-[#26ff59]/10 ccolor border border-[#26ff59]/20"
                    >
                      {metric}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
