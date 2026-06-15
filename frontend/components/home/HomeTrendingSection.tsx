import HomeCommanderGuideRotator from "@/components/home/HomeCommanderGuideRotator";
import HomeMetaMoverRotator from "@/components/home/HomeMetaMoverRotator";
import PopularCommanderGuides from "@/components/PopularCommanderGuides";

export default function HomeTrendingSection() {
  return (
    <section className="mt-8 sm:mt-10">
      <div className="mb-4">
        <h2 className="text-2xl font-black text-white sm:text-3xl">
          What&apos;s trending in Commander
        </h2>
        <p className="mt-1.5 text-sm text-neutral-400 sm:text-base">
          Live meta movers, featured guides, and commanders to explore.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
        <HomeCommanderGuideRotator />
        <HomeMetaMoverRotator />
      </div>

      <div className="mt-4">
        <PopularCommanderGuides embedded />
      </div>
    </section>
  );
}
