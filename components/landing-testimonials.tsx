"use client"

import { Star } from "lucide-react"
import { useState, useEffect } from "react"

export function LandingTestimonials() {
  const testimonials = [
    {
      quote:
        "O.I. Cloud reduced our operational costs by 40% in the first quarter. The AI predictions are incredibly accurate.",
      author: "Maria Silva",
      role: "COO, Manufacturing Corp",
      rating: 5,
    },
    {
      quote: "We replaced 12 different systems with one platform. Our decision-making speed increased by 3x.",
      author: "João Santos",
      role: "CTO, Retail Giant",
      rating: 5,
    },
    {
      quote: "The predictive maintenance feature alone saved us millions in equipment downtime. Game changer.",
      author: "Ana Costa",
      role: "VP Operations, Industrial Group",
      rating: 5,
    },
    {
      quote: "Implementation was seamless. We were up and running in less than a week with full team adoption.",
      author: "Carlos Mendes",
      role: "Director of IT, Logistics Inc",
      rating: 5,
    },
  ]

  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % testimonials.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [testimonials.length])

  return (
    <section className="relative py-32 bg-black overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(59,130,246,0.05)_0%,_transparent_50%)]" />

      <div className="container relative mx-auto px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center space-y-4 mb-20">
            <h2 className="text-5xl md:text-6xl font-bold text-white">Trusted by industry leaders</h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
              Join 500+ enterprises that transformed their operations with O.I. Cloud
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className={`relative rounded-2xl border bg-zinc-950/50 backdrop-blur-sm p-8 transition-all duration-500 ${
                  index === activeIndex ? "border-white/30 scale-105" : "border-white/10 hover:border-white/20"
                }`}
              >
                <div className="flex gap-1 mb-6">
                  {Array.from({ length: testimonial.rating }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-[#26ff59] ccolor" />
                  ))}
                </div>
                <p className="text-zinc-300 leading-relaxed mb-6 text-sm">"{testimonial.quote}"</p>
                <div>
                  <div className="font-semibold text-white">{testimonial.author}</div>
                  <div className="text-sm text-zinc-500">{testimonial.role}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-2 mt-12">
            {testimonials.map((_, index) => (
              <button
                key={index}
                onClick={() => setActiveIndex(index)}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  index === activeIndex ? "w-8 cback" : "bg-white/20 hover:bg-white/40"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
