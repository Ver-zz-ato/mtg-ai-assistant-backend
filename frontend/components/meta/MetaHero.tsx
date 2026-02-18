/**
 * Meta Hero - Headline + subtext for meta dashboard.
 * SSR-compatible.
 */

type Props = {
  headline: string;
  subtext: string;
  children?: React.ReactNode;
};

export function MetaHero({ headline, subtext, children }: Props) {
  return (
    <section className="mb-8">
      <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
        {headline}
      </h1>
      <p className="text-neutral-300 text-lg md:text-xl leading-relaxed mb-6 max-w-2xl">
        {subtext}
      </p>
      {children}
    </section>
  );
}
