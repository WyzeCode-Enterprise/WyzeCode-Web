import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

const faqs = [
  {
    question: "What is O.I. Cloud?",
    answer:
      "A unified operational intelligence platform that connects your enterprise systems and uses AI to detect issues, predict outcomes, and automate decisions in real-time.",
  },
  {
    question: "How long does implementation take?",
    answer:
      "Most enterprises are operational within 2-4 weeks. Our pre-built connectors integrate with major systems in hours, with dedicated onboarding support throughout.",
  },
  {
    question: "Which systems does it integrate with?",
    answer:
      "Any system with an API—SAP, Oracle, Salesforce, Microsoft Dynamics, PostgreSQL, MongoDB, AWS IoT, and custom internal systems. We support REST APIs, webhooks, and direct database connections.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Yes. Bank-level AES-256 encryption, SOC 2 Type II certified, with on-premise deployment options. All data encrypted in transit and at rest with role-based access control.",
  },
]

export function LandingFAQ() {
  return (
    <section id="faq" className="py-32 lg:py-40 bg-zinc-950">
      <div className="container mx-auto px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center space-y-6 mb-16">
            <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-white">FAQ</h2>
            <p className="text-xl text-zinc-400">Common questions about O.I. Cloud</p>
          </div>

          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="rounded-lg border border-white/10 bg-white/5 px-6 hover:border-white/20 transition-colors"
              >
                <AccordionTrigger className="text-left text-lg font-medium text-white hover:no-underline py-5">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-zinc-400 leading-relaxed pb-5">{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  )
}
