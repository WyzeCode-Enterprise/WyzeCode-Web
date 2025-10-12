import { Code2, Database, Cloud, Lock, Zap, Globe } from "lucide-react"

export function LandingTechStack() {
  const technologies = [
    {
      category: "Frontend",
      icon: Code2,
      items: ["React", "Next.js", "TypeScript", "Tailwind CSS"],
    },
    {
      category: "Backend",
      icon: Database,
      items: ["Node.js", "Python", "PostgreSQL", "Redis"],
    },
    {
      category: "Infrastructure",
      icon: Cloud,
      items: ["AWS", "Kubernetes", "Docker", "Terraform"],
    },
    {
      category: "Security",
      icon: Lock,
      items: ["OAuth 2.0", "AES-256", "SSL/TLS", "WAF"],
    },
    {
      category: "AI/ML",
      icon: Zap,
      items: ["TensorFlow", "PyTorch", "Scikit-learn", "OpenAI"],
    },
    {
      category: "Monitoring",
      icon: Globe,
      items: ["Datadog", "Grafana", "Prometheus", "Sentry"],
    },
  ]

  return (
    <section className="relative py-32 bg-black overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(38,255,89,0.05)_0%,_transparent_50%)]" />

      <div className="container relative mx-auto px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-bold text-white mb-6">Built with modern tech</h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
              Powered by industry-leading technologies and frameworks
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {technologies.map((tech, index) => {
              const Icon = tech.icon
              return (
                <div
                  key={index}
                  className="rounded-2xl border border-white/10 bg-zinc-950/50 backdrop-blur-sm p-8 hover:border-white/20 transition-colors"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-white">{tech.category}</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tech.items.map((item, i) => (
                      <span
                        key={i}
                        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-zinc-400"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
