import type { Metadata } from "next";
import Link from "next/link";
import CustomCardCreator from "@/components/CustomCardCreator";
import { ToolInfoRail } from "@/components/tools/ToolInfoRail";

export const metadata: Metadata = {
  title: "Custom Card Creator | ManaTap",
  description: "Create, save, and share fan-made Magic card profile cards with ManaTap.",
  alternates: { canonical: "https://www.manatap.ai/tools/custom-card" },
};

export default function CustomCardToolPage() {
  return (
    <main className="min-h-[calc(100vh-82px)] bg-[#050608] text-white">
      <section className="mx-auto max-w-[1500px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/tools" className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300 hover:text-cyan-200">
              Tools
            </Link>
            <h1 className="mt-2 text-4xl font-black tracking-normal sm:text-5xl">Custom Card Creator</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
              Generate a playful fan-made card, edit the face, choose Scryfall-sourced art, then save it to your profile or share a public card page.
            </p>
          </div>
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <CustomCardCreator />
          </div>
          <aside className="xl:sticky xl:top-24 xl:self-start">
            <CustomCardSideRail />
          </aside>
        </div>
      </section>
    </main>
  );
}

function CustomCardSideRail() {
  return (
    <ToolInfoRail
      title="Custom Card Creator"
      description="Make a fan-made Magic-style profile card, tune the rules text, choose art, then save or share it."
      accent="purple"
      steps={[
        {
          title: "Describe the card",
          body: "Start with a persona, joke, commander vibe, or deck identity. The clearer the hook, the better the first draft.",
          tone: "purple",
        },
        {
          title: "Tune the face",
          body: "Pick style and power, then edit the generated name, type line, rules text, flavor, and stats directly.",
          tone: "cyan",
        },
        {
          title: "Choose art and share",
          body: "Select Scryfall-sourced art with credit, save it to your account, attach it to profile, copy a link, or show QR.",
          tone: "amber",
        },
      ]}
      carousel={[
        {
          kicker: "Prompt starter",
          title: "Graveyard value wizard",
          body: "A self-aware necromancer who turns failed combos into card advantage and politely asks the table for one more turn.",
          chips: ["Dimir", "Value", "Dry humor"],
          tone: "purple",
        },
        {
          kicker: "Prompt starter",
          title: "Chaotic red mage",
          body: "A coin-flip pyromancer whose best plan is technically legal, barely repeatable, and very funny when it works.",
          chips: ["Izzet", "Coin flips", "High variance"],
          tone: "rose",
        },
        {
          kicker: "Prompt starter",
          title: "Tiny creature monarch",
          body: "A noble token leader who wins through a board of small creatures, anthem effects, and suspiciously dramatic speeches.",
          chips: ["Selesnya", "Tokens", "Profile card"],
          tone: "emerald",
        },
      ]}
      faq={[
        {
          q: "Is this an official Magic card?",
          a: "No. It is a fan-made ManaTap card for profiles, jokes, and sharing. It is not legal game material.",
        },
        {
          q: "Where does the art come from?",
          a: "The creator can use Scryfall-sourced card art and keeps artist credit visible where available.",
        },
        {
          q: "Can I save or share it?",
          a: "Yes. Signed-in users can save cards, attach one to their profile, copy the public link, or show a QR code.",
        },
      ]}
      related={[
        { href: "/profile", label: "Profile", sub: "Attach and show your saved card", tone: "purple" },
        { href: "/tools/playstyle-quiz", label: "Playstyle Quiz", sub: "Find the vibe before you write it", tone: "cyan" },
        { href: "/build-a-deck", label: "Deck Builder", sub: "Turn the card idea into a deck", tone: "emerald" },
        { href: "/tools/finish-deck", label: "Complete This Deck", sub: "Patch the deck after brewing", tone: "amber" },
      ]}
    />
  );
}
