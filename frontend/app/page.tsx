// app/page.tsx
import nextDynamic from "next/dynamic";
import ModeOptions from "../components/ModeOptions";

// Avoid DYNAMIC_SERVER_USAGE: allow request-time data so any downstream use of cookies/headers is valid (e.g. suspense cache, middleware, or transitive deps).
export const dynamic = "force-dynamic";
import LeftSidebar from "../components/LeftSidebar";
import Chat from "../components/Chat";
import FeedbackFab from "../components/FeedbackFab";
import TopToolsStrip from "../components/TopToolsStrip";
import AIMemoryGreeting from "../components/AIMemoryGreeting";
import EmailVerificationSuccessPopup from "../components/EmailVerificationSuccessPopup";
import LivePresenceBanner from "../components/LivePresenceBanner";
import HomepageSignupBanner from "../components/HomepageSignupBanner";
import HomeVariantB from "../components/HomeVariantB";
import HomepageFAQ from "../components/HomepageFAQ";
import { TrendingCommandersStrip } from "../components/TrendingCommandersStrip";
import { getHomeVariant } from "../lib/analytics/home-experiment";

// PERFORMANCE: Lazy load heavy sidebar components to improve initial load
const RightSidebar = nextDynamic(() => import("../components/RightSidebar"), {
  loading: () => <div className="animate-pulse bg-gray-800 rounded-2xl h-48" />
});

const MetaDeckPanel = nextDynamic(() => import("../components/MetaDeckPanel"), {
  loading: () => <div className="animate-pulse bg-purple-900/20 rounded-2xl h-32 border border-purple-800/30" />
});

const Shoutbox = nextDynamic(() => import("../components/Shoutbox"), {
  loading: () => <div className="animate-pulse bg-neutral-900 rounded-2xl h-48" />
});

function jsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "ManaTap AI",
    "description": "AI-powered Magic: The Gathering deck building assistant with intelligent chat, cost analysis, and budget optimization tools.",
    "url": "https://www.manatap.ai",
    "applicationCategory": "GameApplication",
    "operatingSystem": "Web Browser",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock"
    },
    "publisher": {
      "@type": "Organization",
      "name": "ManaTap.ai",
      "url": "https://www.manatap.ai"
    },
    "dateModified": "2025-10-22T00:00:00Z",
    "featureList": [
      "AI Chat Assistant",
      "Deck Builder", 
      "Price Tracking",
      "Budget Optimization",
      "Collection Management",
      "Mulligan Simulator",
      "Probability Calculator"
    ]
  };
  return JSON.stringify(data);
}

export default function Page() {
  const variant = getHomeVariant();
  const showVariantB = variant === 'B';
  
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd() }} />
      <ModeOptions />
      
      <div className="w-full relative">
        <div className="max-w-[1600px] mx-auto px-4 pt-0">
          <TopToolsStrip />
        </div>
        <div className="max-w-[1600px] mx-auto px-4 pt-2">
          <LivePresenceBanner />
        </div>
        
        {/* Homepage Signup Banner - shown for guest users */}
        <HomepageSignupBanner />
        
        {/* Variant B: Activation-first CTA above the fold */}
        {showVariantB && (
          <div className="max-w-[1600px] mx-auto px-4 pt-4">
            <HomeVariantB />
          </div>
        )}
        
        <div className="max-w-[1600px] mx-auto px-4 py-0 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left sidebar - hidden on mobile, shown on large screens */}
          <aside className="hidden lg:block lg:col-span-2 space-y-4">
            <Shoutbox />
            <MetaDeckPanel />
            <LeftSidebar />
          </aside>
          
          {/* Main chat area - 1.5x wider */}
          <section className="col-span-1 lg:col-span-7 xl:col-span-7 flex flex-col gap-3 pt-2 h-full min-h-0" data-chat-area>
            <AIMemoryGreeting className="mb-3" />
            <Chat />
          </section>
          
          {/* Right sidebar - stacked below on mobile/tablet, side panel on desktop; scrolls with page like left sidebar */}
          <aside className="col-span-1 lg:col-span-3 xl:col-span-3 order-last lg:order-none">
            <RightSidebar />
          </aside>
        </div>

        {/* Trending Commanders - product strip below builder */}
        <TrendingCommandersStrip />

        {/* SEO nav links - minimal, no collapsible */}
        <nav className="max-w-[1600px] mx-auto px-4 py-3 mt-2 border-t border-neutral-800 text-center text-sm text-neutral-500" aria-label="Tools and discovery">
          <a href="/tools/mulligan" className="hover:text-white">Mulligan</a>
          <span className="mx-2 text-neutral-600">·</span>
          <a href="/tools/probability" className="hover:text-white">Probability</a>
          <span className="mx-2 text-neutral-600">·</span>
          <a href="/collections/cost-to-finish" className="hover:text-white">Cost to Finish</a>
          <span className="mx-2 text-neutral-600">·</span>
          <a href="/deck/swap-suggestions" className="hover:text-white">Budget Swaps</a>
          <span className="mx-2 text-neutral-600">·</span>
          <a href="/price-tracker" className="hover:text-white">Price Tracker</a>
          <span className="mx-2 text-neutral-600">|</span>
          <a href="/commanders" className="hover:text-white">Commanders</a>
          <span className="mx-2 text-neutral-600">·</span>
          <a href="/meta" className="hover:text-white">Meta</a>
        </nav>
      </div>
      <FeedbackFab />
      <EmailVerificationSuccessPopup />
    </>
  );
}
