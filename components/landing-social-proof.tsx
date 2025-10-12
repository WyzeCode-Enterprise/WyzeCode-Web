"use client"

export function LandingSocialProof() {
  const companies = [
    "OpenAI",
    "Anthropic",
    "Google",
    "Microsoft",
    "Amazon",
    "Meta",
    "Tesla",
    "Apple",
    "NVIDIA",
    "IBM",
    "Oracle",
    "SAP",
  ]

  return (
    <section className="relative py-20 bg-black overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(38,255,89,0.03)_0%,_transparent_50%)]" />

      <div className="container relative mx-auto px-6 lg:px-8">
        <p className="text-center text-xs text-zinc-500 font-medium mb-12 tracking-widest uppercase">
          Trusted by industry leaders worldwide
        </p>

        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-black to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-black to-transparent z-10" />

          <div className="flex overflow-hidden">
            <div className="flex animate-scroll">
              {[...companies, ...companies].map((company, index) => (
                <div
                  key={index}
                  className="flex-shrink-0 mx-8 flex items-center justify-center opacity-30 hover:opacity-100 transition-opacity duration-300"
                >
                  <span className="text-2xl font-bold text-white whitespace-nowrap">{company}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
