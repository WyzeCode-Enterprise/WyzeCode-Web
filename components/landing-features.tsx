import { Globe, Zap, Shield } from "lucide-react"

const features = [
  {
    icon: Globe,
    title: "Unified Data Platform",
    description: "Connect ERP, CRM, IoT, and production systems. One source of truth for your entire operation.",
  },
  {
    icon: Zap,
    title: "AI-Powered Insights",
    description: "Real-time anomaly detection, predictive analytics, and automated decision-making at scale.",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "Bank-level encryption, SOC 2 compliance, and granular access control for sensitive data.",
  },
]

export function LandingFeatures() {
  return (
    <section id="features" className="py-32 lg:py-40 bg-black">
      <div className="container mx-auto px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-6 mb-20">
            <h2 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white">
              Built for enterprise
            </h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
              Everything you need to transform operational data into intelligent action.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="group space-y-6">
                <div className="flex size-12 items-center justify-center rounded-lg cback">
                  <feature.icon className="size-6 text-black" />
                </div>
                <h3 className="text-2xl font-semibold text-white">{feature.title}</h3>
                <p className="text-zinc-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
