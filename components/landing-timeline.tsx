import { Check } from "lucide-react"

export function LandingTimeline() {
  const milestones = [
    {
      year: "2024 Q1",
      title: "Platform Launch",
      description: "Initial release with core operational intelligence features",
    },
    {
      year: "2024 Q2",
      title: "AI Integration",
      description: "Advanced machine learning models for predictive analytics",
    },
    {
      year: "2024 Q3",
      title: "Enterprise Scale",
      description: "Multi-region deployment and 99.99% uptime SLA",
    },
    {
      year: "2024 Q4",
      title: "Global Expansion",
      description: "25+ regions worldwide with localized support",
    },
  ]

  return (
    <section className="relative py-32 bg-black overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(59,130,246,0.05)_0%,_transparent_50%)]" />

      <div className="container relative mx-auto px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-bold text-white mb-6">Our journey</h2>
            <p className="text-xl text-zinc-400">Building the future of operational intelligence</p>
          </div>

          <div className="relative">
            <div className="absolute left-8 top-0 bottom-0 w-px bg-white/10" />

            <div className="space-y-12">
              {milestones.map((milestone, index) => (
                <div key={index} className="relative flex gap-8">
                  <div className="flex-shrink-0 w-16 h-16 rounded-full border-2 border-white/20 bg-black flex items-center justify-center z-10">
                    <Check className="w-6 h-6 ccolor" />
                  </div>
                  <div className="flex-1 pb-12">
                    <p className="text-sm ccolor font-medium mb-2">{milestone.year}</p>
                    <h3 className="text-2xl font-bold text-white mb-2">{milestone.title}</h3>
                    <p className="text-zinc-400">{milestone.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
