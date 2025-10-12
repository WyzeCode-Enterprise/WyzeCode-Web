"use client"

import { Users, MessageSquare, Github, Twitter } from "lucide-react"

export function LandingCommunity() {
  const stats = [
    { label: "Active Users", value: "50K+" },
    { label: "GitHub Stars", value: "12K+" },
    { label: "Discord Members", value: "8K+" },
    { label: "Countries", value: "120+" },
  ]

  const channels = [
    {
      icon: MessageSquare,
      name: "Discord",
      description: "Join our community",
      link: "#",
    },
    {
      icon: Github,
      name: "GitHub",
      description: "Contribute to the project",
      link: "#",
    },
    {
      icon: Twitter,
      name: "Twitter",
      description: "Follow for updates",
      link: "#",
    },
    {
      icon: Users,
      name: "Forum",
      description: "Ask questions",
      link: "#",
    },
  ]

  return (
    <section className="relative py-32 px-6">
      <div className="absolute inset-0 bg-gradient-radial from-cgreen/5 via-transparent to-transparent opacity-30" />

      <div className="max-w-7xl mx-auto relative">
        <div className="text-center mb-20">
          <h2 className="text-5xl md:text-6xl font-bold text-white mb-6">Join Our Community</h2>
          <p className="text-xl text-neutral-400 max-w-2xl mx-auto">
            Connect with developers and teams building the future
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
          {stats.map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-4xl md:text-5xl font-bold text-cgreen mb-2">{stat.value}</div>
              <div className="text-neutral-400">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {channels.map((channel, index) => (
            <a
              key={index}
              href={channel.link}
              className="group p-8 rounded-2xl bg-neutral-900/50 border border-neutral-800 hover:border-cgreen/50 transition-all duration-300 text-center"
            >
              <channel.icon className="w-12 h-12 text-cgreen mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">{channel.name}</h3>
              <p className="text-neutral-400 text-sm">{channel.description}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
