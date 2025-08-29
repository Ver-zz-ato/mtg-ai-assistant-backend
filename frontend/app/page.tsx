import LeftSidebar from "@/components/LeftSidebar";
import RightSidebar from "@/components/RightSidebar";
import Chat from "@/components/Chat";

export default function Page() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-4 grid grid-cols-12 gap-4">
      <aside className="hidden lg:flex col-span-3">
        <LeftSidebar />
      </aside>

      <section className="col-span-12 lg:col-span-6 flex flex-col">
        <Chat />
      </section>

      <aside className="col-span-12 lg:col-span-3">
        <RightSidebar />
      </aside>
    </div>
  );
}
