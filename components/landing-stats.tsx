export function LandingStats() {
  const stats = [
    { value: "99.9%", label: "Uptime Guarantee" },
    { value: "2.5x", label: "Faster Decisions" },
    { value: "40%", label: "Cost Reduction" },
    { value: "500+", label: "Enterprise Clients" },
  ]

  return (
    <section className="relative py-32 bg-black overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(38,255,89,0.03)_0%,_transparent_50%)]" />

      <div className="container relative mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-16 max-w-6xl mx-auto">
          {stats.map((stat, index) => (
            <div key={index} className="text-center space-y-3 group">
              <div className="text-5xl lg:text-7xl font-bold text-white group-hover:ccolor transition-colors duration-300">
                {stat.value}
              </div>
              <div className="text-sm lg:text-base text-zinc-500 font-medium">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
