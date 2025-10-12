import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"
import Link from "next/link"

export function LandingPricing() {
  const plans = [
    {
      name: "Starter",
      price: "R$ 25.000",
      period: "/mês",
      description: "Perfect for medium-sized enterprises",
      features: [
        "Up to 5 data source integrations",
        "Real-time dashboards",
        "Basic AI predictions",
        "Email support",
        "Monthly reports",
      ],
      cta: "Start Free Trial",
      highlighted: false,
    },
    {
      name: "Enterprise",
      price: "R$ 120.000",
      period: "/mês",
      description: "For large corporations",
      features: [
        "Unlimited data integrations",
        "Advanced AI & automation",
        "Predictive analytics",
        "24/7 dedicated support",
        "Custom SLA",
        "On-premise deployment option",
      ],
      cta: "Contact Sales",
      highlighted: true,
    },
    {
      name: "Custom",
      price: "Custom",
      period: "",
      description: "For multinational operations",
      features: [
        "Everything in Enterprise",
        "White-label solution",
        "Dedicated AI training",
        "Multi-region deployment",
        "Custom integrations",
        "Executive consulting",
      ],
      cta: "Talk to Us",
      highlighted: false,
    },
  ]

  return (
    <section id="pricing" className="py-24 lg:py-32">
      <div className="container mx-auto px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">Simple, Transparent Pricing</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Choose the plan that fits your enterprise needs. All plans include core AI features.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan, index) => (
              <div
                key={index}
                className={`relative rounded-2xl border p-8 ${
                  plan.highlighted
                    ? "border-[#26ff59] bg-[#26ff59]/5 shadow-lg shadow-[#26ff59]/20"
                    : "border-border/50 bg-card/50 backdrop-blur-sm"
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full cback text-black text-sm font-semibold">
                    Most Popular
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <Check className="size-5 ccolor flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  size="lg"
                  className={`w-full rounded-full ${
                    plan.highlighted
                      ? "cback text-black hover:opacity-90 font-semibold"
                      : "bg-transparent border border-border/50 hover:border-[#26ff59]/50"
                  }`}
                  variant={plan.highlighted ? "default" : "outline"}
                >
                  <Link href="/login">{plan.cta}</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
