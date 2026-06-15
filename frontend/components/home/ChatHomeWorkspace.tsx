import nextDynamic from "next/dynamic";
import ModeOptions from "@/components/ModeOptions";
import LeftSidebar from "@/components/LeftSidebar";
import Chat from "@/components/Chat";
import FeedbackFab from "@/components/FeedbackFab";
import ResponsiveLeftSidebar from "@/components/ResponsiveLeftSidebar";
import CommunityDrawer from "@/components/CommunityDrawer";
import CommunityDrawerContent from "@/components/CommunityDrawerContent";
import MobileOnlyContent from "@/components/MobileOnlyContent";
import AppComingSoonBanner from "@/components/AppComingSoonBanner";
import AIMemoryGreeting from "@/components/AIMemoryGreeting";
import EmailVerificationSuccessPopup from "@/components/EmailVerificationSuccessPopup";
import LivePresenceBanner from "@/components/LivePresenceBanner";
import HomepageSignupBanner from "@/components/HomepageSignupBanner";
import HomeVariantB from "@/components/HomeVariantB";

const RightSidebar = nextDynamic(() => import("@/components/RightSidebar"), {
  loading: () => <div className="animate-pulse bg-gray-800 rounded-2xl h-48" />,
});

const MetaDeckPanel = nextDynamic(() => import("@/components/MetaDeckPanel"), {
  loading: () => (
    <div className="animate-pulse bg-purple-900/20 rounded-2xl h-32 border border-purple-800/30" />
  ),
});

const Shoutbox = nextDynamic(() => import("@/components/Shoutbox"), {
  loading: () => <div className="animate-pulse bg-neutral-900 rounded-2xl h-48" />,
});

const DeckRoastPanel = nextDynamic(() => import("@/components/DeckRoastPanel"), {
  loading: () => (
    <div className="animate-pulse bg-amber-950/20 rounded-2xl h-24 border border-amber-800/30" />
  ),
});

export type ChatHomeWorkspaceProps = {
  showRightSidebar?: boolean;
  showVariantB?: boolean;
  showAppBanner?: boolean;
  /** Tighter inner grid for tool-page layout (e.g. /new-chat). */
  embedded?: boolean;
};

export default function ChatHomeWorkspace({
  showRightSidebar = true,
  showVariantB = false,
  showAppBanner = true,
  embedded = false,
}: ChatHomeWorkspaceProps) {
  const gridClass = embedded
    ? "grid grid-cols-1 md:grid-cols-10 gap-4"
    : "grid grid-cols-1 md:grid-cols-12 gap-6";

  const chatColClass = showRightSidebar
    ? "col-span-1 md:col-span-7 xl:col-span-7"
    : embedded
      ? "col-span-1 md:col-span-10"
      : "col-span-1 md:col-span-10";

  return (
    <>
      <ModeOptions />

      <div className="w-full relative">
        {showAppBanner ? <AppComingSoonBanner /> : null}

        {!embedded ? (
          <div className="max-w-[1600px] mx-auto px-4 pt-0">
            <LivePresenceBanner />
          </div>
        ) : null}

        <HomepageSignupBanner compact={embedded} />

        {showVariantB && !embedded ? (
          <div className="max-w-[1600px] mx-auto px-4 pt-4">
            <HomeVariantB />
          </div>
        ) : null}

        <div
          className={`${embedded ? "" : "max-w-[1600px] mx-auto px-4 py-0"} ${gridClass}`}
        >
          {!embedded ? (
            <ResponsiveLeftSidebar>
              <DeckRoastPanel variant="panel" showSignupCta={true} useModal={true} />
              <Shoutbox />
              <MetaDeckPanel />
              <LeftSidebar />
            </ResponsiveLeftSidebar>
          ) : null}

          <section className={`${chatColClass} flex flex-col gap-3 pt-2`} data-chat-area>
            <AIMemoryGreeting className="flex-shrink-0" />
            <Chat />
          </section>

          {showRightSidebar ? (
            <aside className="col-span-1 md:col-span-3 xl:col-span-3 order-last md:order-none">
              <RightSidebar />
            </aside>
          ) : null}
        </div>
      </div>

      {!embedded ? (
        <CommunityDrawer>
          <MobileOnlyContent>
            <CommunityDrawerContent />
          </MobileOnlyContent>
        </CommunityDrawer>
      ) : null}
      <FeedbackFab />
      <EmailVerificationSuccessPopup />
    </>
  );
}
