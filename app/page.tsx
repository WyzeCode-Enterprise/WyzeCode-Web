import { LandingHeader } from "@/components/landing-header"
import { LandingHero } from "@/components/landing-hero"
import { LandingStats } from "@/components/landing-stats"
import { LandingFeatures } from "@/components/landing-features"
import { LandingSocialProof } from "@/components/landing-social-proof"
import { LandingBento } from "@/components/landing-bento"
import { LandingHowItWorks } from "@/components/landing-how-it-works"
import { LandingShowcase } from "@/components/landing-showcase"
import { LandingVideo } from "@/components/landing-video"
import { LandingIntegrations } from "@/components/landing-integrations"
import { LandingTimeline } from "@/components/landing-timeline"
import { LandingComparison } from "@/components/landing-comparison"
import { LandingCTA } from "@/components/landing-cta"
import { LandingTestimonials } from "@/components/landing-testimonials"
import { LandingTechStack } from "@/components/landing-tech-stack"
import { LandingSecurity } from "@/components/landing-security"
import { LandingAPI } from "@/components/landing-api"
import { LandingPricing } from "@/components/landing-pricing"
import { LandingResources } from "@/components/landing-resources"
import { LandingCommunity } from "@/components/landing-community"
import { LandingGlobal } from "@/components/landing-global"
import { LandingAwards } from "@/components/landing-awards"
import { LandingFAQ } from "@/components/landing-faq"
import { LandingNewsletter } from "@/components/landing-newsletter"
import { LandingFooter } from "@/components/landing-footer"

export default function Page() {
  return (
    <div className="min-h-screen bg-black">
      <LandingHeader />
      <LandingHero />
      <LandingSocialProof />
      <LandingStats />
      <LandingFeatures />
      <LandingBento />
      <LandingVideo />
      <LandingHowItWorks />
      <LandingShowcase />
      <LandingTimeline />
      <LandingIntegrations />
      <LandingComparison />
      <LandingCTA />
      <LandingTestimonials />
      <LandingTechStack />
      <LandingSecurity />
      <LandingAPI />
      <LandingPricing />
      <LandingResources />
      <LandingCommunity />
      <LandingGlobal />
      <LandingAwards />
      <LandingFAQ />
      <LandingNewsletter />
      <LandingFooter />
    </div>
  )
}
