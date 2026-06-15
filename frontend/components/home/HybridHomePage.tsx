import HomeHero from "./HomeHero";
import HomeMobileInstallBanner from "./HomeMobileInstallBanner";
import HomeProblemFinder from "./HomeProblemFinder";
import HomePopularTools from "./HomePopularTools";
import HomeTrendingSection from "./HomeTrendingSection";

export default function HybridHomePage() {
  return (
    <div className="relative w-full overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,0.06),transparent_32%),radial-gradient(circle_at_80%_40%,rgba(34,211,238,0.05),transparent_28%)]" />
      <div className="relative mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <HomeHero />
        <HomeMobileInstallBanner />
        <HomeProblemFinder />
        <HomePopularTools />
        <HomeTrendingSection />
      </div>
    </div>
  );
}
