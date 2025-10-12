"use client"

import { Globe } from "lucide-react"

export function LandingGlobal() {
  const regions = [
    { name: "North America", users: "15K+", color: "bg-blue-500" },
    { name: "Europe", users: "12K+", color: "bg-green-500" },
    { name: "Asia Pacific", users: "18K+", color: "bg-purple-500" },
    { name: "Latin America", users: "5K+", color: "bg-yellow-500" },
  ]

  return (
    <section className="relative py-32 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-3 mb-6">
            <Globe className="w-8 h-8 text-cgreen" />
            <h2 className="text-5xl md:text-6xl font-bold text-white">Global Reach</h2>
          </div>
          <p className="text-xl text-neutral-400 max-w-2xl mx-auto">Trusted by teams in over 120 countries worldwide</p>
        </div>

        <div className="relative aspect-[2/1] max-w-4xl mx-auto mb-16 rounded-3xl overflow-hidden bg-neutral-900/50 border border-neutral-800">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-full h-full">
              {/* Simplified world map representation */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-neutral-700 text-9xl">
                  <Globe className="w-64 h-64" />
                </div>
              </div>
              {/* Animated dots */}
              <div className="absolute top-1/4 left-1/4 w-3 h-3 bg-cgreen rounded-full animate-ping" />
              <div className="absolute top-1/3 right-1/3 w-3 h-3 bg-cgreen rounded-full animate-ping delay-100" />
              <div className="absolute bottom-1/3 left-1/2 w-3 h-3 bg-cgreen rounded-full animate-ping delay-200" />
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {regions.map((region, index) => (
            <div key={index} className="p-6 rounded-2xl bg-neutral-900/50 border border-neutral-800">
              <div className={`w-3 h-3 ${region.color} rounded-full mb-4`} />
              <h3 className="text-xl font-semibold text-white mb-2">{region.name}</h3>
              <p className="text-2xl font-bold text-cgreen">{region.users}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
