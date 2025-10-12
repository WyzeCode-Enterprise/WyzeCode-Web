"use client"

import { Copy, Check } from "lucide-react"
import { useState } from "react"

export function LandingAPI() {
  const [copied, setCopied] = useState(false)

  const codeExample = `// Initialize O.I. Cloud SDK
import { OICloud } from '@oicloud/sdk'

const client = new OICloud({
  apiKey: process.env.OI_API_KEY
})

// Get real-time operational insights
const insights = await client.analytics.getInsights({
  timeRange: '24h',
  metrics: ['production', 'sales', 'inventory']
})

// AI-powered predictions
const predictions = await client.ai.predict({
  model: 'anomaly-detection',
  data: insights
})`

  const handleCopy = () => {
    navigator.clipboard.writeText(codeExample)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="relative py-32 bg-black overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(38,255,89,0.05)_0%,_transparent_50%)]" />

      <div className="container relative mx-auto px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-5xl md:text-6xl font-bold text-white mb-6">Developer-first API</h2>
              <p className="text-xl text-zinc-400 mb-8 leading-relaxed">
                Simple, powerful APIs that integrate seamlessly with your existing stack. Get started in minutes with
                our comprehensive SDKs and documentation.
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full cback" />
                  <span className="text-zinc-300">RESTful and GraphQL APIs</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full cback" />
                  <span className="text-zinc-300">SDKs for JavaScript, Python, Go, and more</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full cback" />
                  <span className="text-zinc-300">Webhooks for real-time events</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full cback" />
                  <span className="text-zinc-300">Comprehensive documentation</span>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-1 bg-gradient-to-r from-green-500/20 to-blue-500/20 rounded-2xl blur-xl opacity-50" />
              <div className="relative rounded-2xl border border-white/10 bg-zinc-950 backdrop-blur-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                  </div>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm text-zinc-400"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-6 overflow-x-auto">
                  <code className="text-sm text-zinc-300 font-mono leading-relaxed">{codeExample}</code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
