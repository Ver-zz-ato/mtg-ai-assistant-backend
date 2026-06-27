import ChatHomeWorkspace from "@/components/home/ChatHomeWorkspace";

export default function ChatPage() {
  return (
    <div className="max-w-[1400px] mx-auto">
      <header className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-violet-900/25 via-fuchsia-900/15 to-cyan-900/20 p-5 sm:p-6 mb-2">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl" aria-hidden="true">
              ✨
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-300 to-cyan-300">
              ManaTap Chat
            </h1>
          </div>
          <p className="text-sm sm:text-base text-neutral-300 max-w-3xl leading-relaxed">
            Ask rules questions, tune your deck, and get focused MTG help. Link a saved deck or paste
            a list so answers stay grounded in what you&apos;re actually playing.
          </p>
          <div className="flex flex-wrap items-center gap-3 mt-3 text-xs sm:text-sm">
            <span className="text-violet-300">Deck-aware answers</span>
            <span className="text-neutral-600" aria-hidden>
              ·
            </span>
            <span className="text-cyan-300">Commander &amp; 60-card</span>
            <span className="text-neutral-600" aria-hidden>
              ·
            </span>
            <span className="text-fuchsia-300">Saved threads when signed in</span>
          </div>
        </div>
      </header>

      <ChatHomeWorkspace
        embedded
        showRightSidebar={false}
        showAppBanner={false}
        showVariantB={false}
      />
    </div>
  );
}
