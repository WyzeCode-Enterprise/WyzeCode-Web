"use client"

import { Award, Star, Trophy } from "lucide-react"

export function LandingAwards() {
  const awards = [
    {
      icon: Trophy,
      title: "Best Enterprise Platform 2024",
      organization: "Tech Innovation Awards",
      year: "2024",
    },
    {
      icon: Star,
      title: "Top 10 AI Solutions",
      organization: "Industry Leaders Magazine",
      year: "2024",
    },
    {
      icon: Award,
      title: "Excellence in Innovation",
      organization: "Global Tech Summit",
      year: "2023",
    },
    {
      icon: Trophy,
      title: "Best Developer Tools",
      organization: "DevOps Excellence",
      year: "2023",
    },
  ]

  return (
    <section className="relative py-32 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <h2 className="text-5xl md:text-6xl font-bold text-white mb-6">Awards & Recognition</h2>
          <p className="text-xl text-neutral-400 max-w-2xl mx-auto">
            Recognized by industry leaders for excellence and innovation
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {awards.map((award, index) => (
            <div
              key={index}
              className="group p-8 rounded-2xl bg-neutral-900/50 border border-neutral-800 hover:border-cgreen/50 transition-all duration-300"
            >
              <award.icon className="w-12 h-12 text-cgreen mb-6 group-hover:scale-110 transition-transform duration-300" />
              <div className="text-sm text-cgreen mb-2">{award.year}</div>
              <h3 className="text-lg font-semibold text-white mb-2">{award.title}</h3>
              <p className="text-neutral-400 text-sm">{award.organization}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
