// app/page.tsx
import dynamic from "next/dynamic";
import ModeOptions from "../components/ModeOptions";
import LeftSidebar from "../components/LeftSidebar";
import Chat from "../components/Chat";
import FeedbackFab from "../components/FeedbackFab"; // ← add this
import TopToolsStrip from "../components/TopToolsStrip";
import AIMemoryGreeting from "../components/AIMemoryGreeting";
import HomepageTourWrapper from "../components/HomepageTourWrapper";

// PERFORMANCE: Lazy load heavy sidebar components to improve initial load
// Note: These are client components, so they won't SSR anyway when lazy loaded
const RightSidebar = dynamic(() => import("../components/RightSidebar"), {
  loading: () => <div className="animate-pulse bg-gray-800 rounded-2xl h-48" />
});

const MetaDeckPanel = dynamic(() => import("../components/MetaDeckPanel"), {
  loading: () => <div className="animate-pulse bg-purple-900/20 rounded-2xl h-32 border border-purple-800/30" />
});

function jsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "ManaTap AI",
    "description": "AI-powered Magic: The Gathering deck building assistant with intelligent chat, cost analysis, and budget optimization tools.",
    "url": "https://manatap.ai",
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
      "url": "https://manatap.ai"
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
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd() }} />
      <ModeOptions />
      <div className="w-full">
        <div className="max-w-[1600px] mx-auto px-4 pt-0">
          <TopToolsStrip />
        </div>
        <div className="max-w-[1600px] mx-auto px-4 py-0 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left sidebar - hidden on mobile, shown on large screens */}
          <aside className="hidden lg:block lg:col-span-2 space-y-4">
            <MetaDeckPanel />
            <LeftSidebar />
          </aside>
          
          {/* Main chat area - 1.5x wider */}
          <section className="col-span-1 lg:col-span-8 xl:col-span-7 flex flex-col gap-3" data-tour="chat">
            <AIMemoryGreeting className="mb-3" />
            <Chat />
          </section>
          
          {/* Right sidebar - stacked below on mobile/tablet, side panel on desktop */}
          <aside className="col-span-1 lg:col-span-2 xl:col-span-3 order-last lg:order-none" data-tour="custom-card">
            <RightSidebar />
          </aside>
        </div>
      </div>
      <FeedbackFab /> {/* ← floating feedback button */}
      <HomepageTourWrapper />
    </>
  );
}
