import { COMMANDERS } from "@/lib/commanders";
import { CommanderLinkWithHover } from "@/components/CommanderLinkWithHover";

/** Take first 10 commanders for Popular Commanders section (SSR) */
const POPULAR = COMMANDERS.slice(0, 10);

export function PopularCommanders() {
  return (
    <section
      className="mt-8 pt-6 border-t border-neutral-700"
      aria-label="Popular Commanders"
    >
      <h2 className="text-lg font-semibold text-neutral-100 mb-2">
        Popular Commanders
      </h2>
      <p className="text-neutral-400 text-sm mb-3">
        Common commander shells people use this tool for.
      </p>
      <ul className="flex flex-wrap gap-3">
        {POPULAR.map((c) => (
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
