// app/page.tsx
import nextDynamic from "next/dynamic";
import ModeOptions from "../components/ModeOptions";

// Avoid DYNAMIC_SERVER_USAGE: allow request-time data so any downstream use of cookies/headers is valid (e.g. suspense cache, middleware, or transitive deps).
export const dynamic = "force-dynamic";
import LeftSidebar from "../components/LeftSidebar";
import Chat from "../components/Chat";
import FeedbackFab from "../components/FeedbackFab";
import ResponsiveLeftSidebar from "../components/ResponsiveLeftSidebar";
import CommunityDrawer from "../components/CommunityDrawer";
import CommunityDrawerContent from "../components/CommunityDrawerContent";
import MobileOnlyContent from "../components/MobileOnlyContent";
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
  const DEBUG_LAYOUT = process.env.NODE_ENV !== "production";
  
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd() }} />
      <ModeOptions />
      
      {/* DEV debug styles */}
      {DEBUG_LAYOUT && (
        <style>{`
          .debug-grid { outline: 2px solid red !important; }
          .debug-chatcol { outline: 2px solid yellow !important; }
          .debug-chat { outline: 2px solid lime !important; }
          .debug-scroll { outline: 2px solid cyan !important; }
        `}</style>
      )}
      
      <div className="w-full relative flex-1 flex flex-col min-h-0">
        {/* Top strips/banners - flex-shrink-0 so they don't collapse */}
        <div className="flex-shrink-0">
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
        </div>
        
        {/* Grid area - flex-1 to take remaining space */}
        <div className="flex-1 min-h-0">
          <div className={`max-w-[1600px] mx-auto px-4 py-0 grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch h-full min-h-0${DEBUG_LAYOUT ? ' debug-grid' : ''}`}>
            {/* Left sidebar - only rendered at md (768px+); CommunityDrawer on mobile */}
            <ResponsiveLeftSidebar>
              <Shoutbox />
              <MetaDeckPanel />
              <LeftSidebar />
            </ResponsiveLeftSidebar>
            
            {/* Main chat area - 1.5x wider */}
            <section className={`col-span-1 md:col-span-7 xl:col-span-7 flex flex-col gap-3 pt-2 h-full min-h-0${DEBUG_LAYOUT ? ' debug-chatcol' : ''}`} data-chat-area>
              <AIMemoryGreeting className="flex-shrink-0" />
              <Chat className={`flex-1 min-h-0${DEBUG_LAYOUT ? ' debug-chat' : ''}`} />
            </section>
            
            {/* Right sidebar - stacked below on mobile, side panel at md+; scrolls with page like left sidebar */}
            <aside className="col-span-1 md:col-span-3 xl:col-span-3 order-last md:order-none">
              <RightSidebar />
            </aside>
          </div>
        </div>

        {/* Bottom content - flex-shrink-0 */}
        <div className="flex-shrink-0">
          {/* Trending Commanders - product strip below builder */}
          <TrendingCommandersStrip />

          {/* SEO nav links - minimal, no collapsible; distinct colors to draw attention */}
          <nav className="max-w-[1600px] mx-auto px-4 py-3 mt-2 border-t border-neutral-800 text-center text-sm" aria-label="Tools and discovery">
            <a href="/tools/mulligan" className="text-amber-400 hover:text-amber-300 transition-colors">Mulligan</a>
            <span className="mx-2 text-neutral-600">·</span>
            <a href="/tools/probability" className="text-cyan-400 hover:text-cyan-300 transition-colors">Probability</a>
            <span className="mx-2 text-neutral-600">·</span>
            <a href="/collections/cost-to-finish" className="text-emerald-400 hover:text-emerald-300 transition-colors">Cost to Finish</a>
            <span className="mx-2 text-neutral-600">·</span>
            <a href="/deck/swap-suggestions" className="text-lime-400 hover:text-lime-300 transition-colors">Budget Swaps</a>
            <span className="mx-2 text-neutral-600">·</span>
            <a href="/price-tracker" className="text-blue-400 hover:text-blue-300 transition-colors">Price Tracker</a>
            <span className="mx-2 text-neutral-600">|</span>
            <a href="/commanders" className="text-violet-400 hover:text-violet-300 transition-colors">Commanders</a>
            <span className="mx-2 text-neutral-600">·</span>
            <a href="/meta" className="text-fuchsia-400 hover:text-fuchsia-300 transition-colors">Meta</a>
          </nav>
        </div>
      </div>
      <CommunityDrawer>
        <MobileOnlyContent>
          <CommunityDrawerContent />
        </MobileOnlyContent>
      </CommunityDrawer>
      <FeedbackFab />
      <EmailVerificationSuccessPopup />
    </>
  );
}
