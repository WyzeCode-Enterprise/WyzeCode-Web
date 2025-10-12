"use client"

import { Book, FileText, Video, Code } from "lucide-react"

export function LandingResources() {
  const resources = [
    {
      icon: Book,
      title: "Documentation",
      description: "Complete guides and API references",
      link: "#",
    },
    {
      icon: FileText,
      title: "Case Studies",
      description: "Real-world implementation examples",
      link: "#",
    },
    {
      icon: Video,
      title: "Video Tutorials",
      description: "Step-by-step video guides",
      link: "#",
    },
    {
      icon: Code,
      title: "Code Examples",
      description: "Ready-to-use code snippets",
      link: "#",
    },
  ]

  return (
    <section className="relative py-32 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-20">
          <h2 className="text-5xl md:text-6xl font-bold text-white mb-6">Resources</h2>
          <p className="text-xl text-neutral-400 max-w-2xl mx-auto">Everything you need to get started and succeed</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {resources.map((resource, index) => (
            <a
              key={index}
              href={resource.link}
              className="group relative p-8 rounded-2xl bg-neutral-900/50 border border-neutral-800 hover:border-neutral-700 transition-all duration-300"
            >
              <resource.icon className="w-12 h-12 text-cgreen mb-6" />
              <h3 className="text-xl font-semibold text-white mb-3">{resource.title}</h3>
              <p className="text-neutral-400">{resource.description}</p>
              <div className="absolute inset-0 rounded-2xl bg-cgreen/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
