// app/page.tsx
import ModeOptions from "../components/ModeOptions";
import LeftSidebar from "../components/LeftSidebar";
import RightSidebar from "../components/RightSidebar";
import Chat from "../components/Chat";
import FeedbackFab from "../components/FeedbackFab"; // ← add this
import TopToolsStrip from "../components/TopToolsStrip";
import AIMemoryGreeting from "../components/AIMemoryGreeting";

export default function Page() {
  return (
    <>
      <ModeOptions />
      <div className="w-full">
        <div className="max-w-[1600px] mx-auto px-4 pt-0">
          <TopToolsStrip />
        </div>
        <div className="max-w-[1600px] mx-auto px-4 py-0 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left sidebar - hidden on mobile, shown on large screens */}
          <aside className="hidden lg:block lg:col-span-2">
            <LeftSidebar />
          </aside>
          
          {/* Main chat area - 1.5x wider */}
          <section className="col-span-1 lg:col-span-8 xl:col-span-7 flex flex-col gap-3">
            <AIMemoryGreeting className="mb-3" />
            <Chat />
          </section>
          
          {/* Right sidebar - stacked below on mobile/tablet, side panel on desktop */}
          <aside className="col-span-1 lg:col-span-2 xl:col-span-3 order-last lg:order-none">
            <RightSidebar />
          </aside>
        </div>
      </div>
      <FeedbackFab /> {/* ← floating feedback button */}
    </>
  );
}
