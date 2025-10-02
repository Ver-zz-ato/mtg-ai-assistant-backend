// app/page.tsx
import ModeOptions from "../components/ModeOptions";
import LeftSidebar from "../components/LeftSidebar";
import RightSidebar from "../components/RightSidebar";
import Chat from "../components/Chat";
import FeedbackFab from "../components/FeedbackFab"; // ← add this
import TopToolsStrip from "../components/TopToolsStrip";

export default function Page() {
  return (
    <>
      <ModeOptions />
      <div className="w-full">
        <div className="max-w-[1600px] mx-auto px-4 pt-4">
          <TopToolsStrip />
        </div>
        <div className="max-w-[1600px] mx-auto px-4 py-4 grid grid-cols-12 gap-4">
          <aside className="hidden xl:flex xl:col-span-3"><LeftSidebar /></aside>
          <section className="col-span-12 xl:col-span-5 flex flex-col gap-3">
            <Chat />
          </section>
          <aside className="col-span-12 xl:col-span-4"><RightSidebar /></aside>
        </div>
      </div>
      <FeedbackFab /> {/* ← floating feedback button */}
    </>
  );
}
