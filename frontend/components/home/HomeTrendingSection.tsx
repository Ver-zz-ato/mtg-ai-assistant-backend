import HomeCommanderGuideRotator from "@/components/home/HomeCommanderGuideRotator";
import HomeMetaMoverRotator from "@/components/home/HomeMetaMoverRotator";

export default function HomeTrendingSection() {
  return (
    <section className="mt-5 sm:mt-6">
      <div className="mb-3 text-center">
        <h2 className="text-2xl font-black text-white sm:text-3xl">
          What&apos;s trending in Commander
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
        <HomeCommanderGuideRotator />
        <HomeMetaMoverRotator />
      </div>
    </section>
  );
}
