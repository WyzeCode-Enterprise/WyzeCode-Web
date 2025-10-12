import { Button } from "@/components/ui/button"
import Link from "next/link"

const integrations = ["SAP", "Oracle", "Salesforce", "Microsoft", "AWS", "Google Cloud", "PostgreSQL", "MongoDB"]

export function LandingIntegrations() {
  return (
    <section className="py-32 lg:py-40 bg-black">
      <div className="container mx-auto px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center space-y-6 mb-16">
            <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-white">Works with your stack</h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
              Connect to any system with an API. From legacy ERP to modern cloud services.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
            {integrations.map((name, index) => (
              <div
                key={index}
                className="flex items-center justify-center h-20 rounded-lg border border-white/10 bg-white/5 hover:border-white/20 transition-colors"
              >
                <span className="text-sm font-medium text-zinc-400">{name}</span>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Button asChild size="lg" className="cback text-black hover:opacity-90 h-12 px-8 text-base font-medium">
              <Link href="/login">Start building</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
