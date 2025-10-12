import { Shield, Lock, Eye, FileCheck, Server, AlertTriangle } from "lucide-react"

export function LandingSecurity() {
  const features = [
    {
      icon: Shield,
      title: "SOC 2 Type II",
      description: "Certified security controls and compliance",
    },
    {
      icon: Lock,
      title: "End-to-End Encryption",
      description: "AES-256 encryption for data at rest and in transit",
    },
    {
      icon: Eye,
      title: "Privacy First",
      description: "GDPR, CCPA, and LGPD compliant",
    },
    {
      icon: FileCheck,
      title: "Regular Audits",
      description: "Third-party security audits quarterly",
    },
    {
      icon: Server,
      title: "Data Residency",
      description: "Choose where your data is stored",
    },
    {
      icon: AlertTriangle,
      title: "Threat Detection",
      description: "Real-time monitoring and alerts",
    },
  ]

  return (
    <section className="relative py-32 bg-black overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.05)_0%,_transparent_50%)]" />

      <div className="container relative mx-auto px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm mb-6">
              <Shield className="w-4 h-4 ccolor" />
              <span className="text-xs text-zinc-400 font-medium">Enterprise-Grade Security</span>
            </div>
            <h2 className="text-5xl md:text-6xl font-bold text-white mb-6">Security you can trust</h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
              Your data is protected by industry-leading security standards and practices
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon
              return (
                <div
                  key={index}
                  className="rounded-2xl border border-white/10 bg-zinc-950/50 backdrop-blur-sm p-8 hover:border-white/20 transition-colors group"
                >
                  <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center mb-6 group-hover:bg-white/10 transition-colors">
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                  <p className="text-zinc-400 leading-relaxed">{feature.description}</p>
                </div>
              )
            })}
          </div>

          <div className="mt-16 p-8 rounded-2xl border border-white/10 bg-zinc-950/50 backdrop-blur-sm text-center">
            <p className="text-zinc-400 mb-4">
              Trusted by enterprises in regulated industries including healthcare, finance, and government
            </p>
            <div className="flex flex-wrap justify-center gap-6 text-sm text-zinc-500">
              <span>ISO 27001</span>
              <span>•</span>
              <span>HIPAA</span>
              <span>•</span>
              <span>PCI DSS</span>
              <span>•</span>
              <span>SOC 2</span>
              <span>•</span>
              <span>GDPR</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
