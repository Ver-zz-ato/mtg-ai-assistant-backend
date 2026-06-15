import { HOME_TRUST_ITEMS } from "@/lib/home/homeConfig";

export default function HomeTrustRow() {
  return (
    <section className="mt-10 pb-8 sm:mt-12">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {HOME_TRUST_ITEMS.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-white/10 bg-neutral-950/50 px-4 py-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            <p className={`text-sm font-bold sm:text-base ${item.accent}`}>{item.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
