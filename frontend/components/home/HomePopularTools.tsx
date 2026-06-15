import { HOME_POPULAR_TOOLS } from "@/lib/home/homeConfig";
import HomeToolCard from "./HomeToolCard";

export default function HomePopularTools() {
  return (
    <section className="mt-10 sm:mt-12">
      <div className="mb-5">
        <h2 className="text-2xl font-black text-white sm:text-3xl">Popular ManaTap tools</h2>
        <p className="mt-2 text-sm text-neutral-400 sm:text-base">
          Fast paths to the tools players use most.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {HOME_POPULAR_TOOLS.map((tool) => (
          <HomeToolCard key={`${tool.href}-${tool.title}`} tool={tool} />
        ))}
      </div>
    </section>
  );
}
