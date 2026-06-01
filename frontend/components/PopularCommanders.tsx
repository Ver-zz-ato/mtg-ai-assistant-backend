import { CommanderLinkWithHover } from "@/components/CommanderLinkWithHover";
import { getGlobalMetaCommanders } from "@/lib/meta/global-meta-entities";

export async function PopularCommanders() {
  const popular = (await getGlobalMetaCommanders(10).catch(() => [])).filter(
    (commander) => commander.inCatalog
  );

  if (popular.length === 0) return null;

  return (
    <section
      className="mt-8 pt-6 border-t border-neutral-700"
      aria-label="Popular Commanders"
    >
      <h2 className="text-lg font-semibold text-neutral-100 mb-2">
        Popular Commanders
      </h2>
      <p className="text-neutral-400 text-sm mb-3">
        Live Commander shells from ManaTap&apos;s blended meta signals.
      </p>
      <ul className="flex flex-wrap gap-3">
        {popular.map((c) => (
          <li key={c.slug}>
            <CommanderLinkWithHover
              href={`/commanders/${c.slug}`}
              name={c.name}
              className="text-sm"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
