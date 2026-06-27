"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Tone = "cyan" | "emerald" | "purple" | "amber" | "rose";

type RailStep = {
  title: string;
  body: string;
  tone?: Tone;
};

type RailFaq = {
  q: string;
  a: string;
};

type RailLink = {
  href: string;
  label: string;
  sub: string;
  tone?: Tone;
};

type RailSlide = {
  kicker: string;
  title: string;
  body: string;
  chips?: string[];
  tone?: Tone;
};

type ToolInfoRailProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  accent?: Tone;
  steps: RailStep[];
  faq?: RailFaq[];
  related?: RailLink[];
  carousel?: RailSlide[];
};

const TONES: Record<Tone, {
  border: string;
  chip: string;
  glow: string;
  panel: string;
  soft: string;
  text: string;
}> = {
  cyan: {
    border: "border-cyan-300/30",
    chip: "border-cyan-300/30 bg-cyan-300/12 text-cyan-100",
    glow: "from-cyan-400/18 via-cyan-400/5 to-transparent",
    panel: "border-cyan-300/25 bg-cyan-300/10",
    soft: "bg-cyan-300/10",
    text: "text-cyan-200",
  },
  emerald: {
    border: "border-emerald-300/30",
    chip: "border-emerald-300/30 bg-emerald-300/12 text-emerald-100",
    glow: "from-emerald-400/18 via-emerald-400/5 to-transparent",
    panel: "border-emerald-300/25 bg-emerald-300/10",
    soft: "bg-emerald-300/10",
    text: "text-emerald-200",
  },
  purple: {
    border: "border-purple-300/30",
    chip: "border-purple-300/30 bg-purple-300/12 text-purple-100",
    glow: "from-purple-400/20 via-purple-400/6 to-transparent",
    panel: "border-purple-300/25 bg-purple-300/10",
    soft: "bg-purple-300/10",
    text: "text-purple-200",
  },
  amber: {
    border: "border-amber-300/35",
    chip: "border-amber-300/35 bg-amber-300/12 text-amber-100",
    glow: "from-amber-300/18 via-amber-300/5 to-transparent",
    panel: "border-amber-300/25 bg-amber-300/10",
    soft: "bg-amber-300/10",
    text: "text-amber-200",
  },
  rose: {
    border: "border-rose-300/30",
    chip: "border-rose-300/30 bg-rose-300/12 text-rose-100",
    glow: "from-rose-400/18 via-rose-400/5 to-transparent",
    panel: "border-rose-300/25 bg-rose-300/10",
    soft: "bg-rose-300/10",
    text: "text-rose-200",
  },
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function ToolInfoRail({
  title,
  eyebrow = "How it works",
  description,
  accent = "cyan",
  steps,
  faq = [],
  related = [],
  carousel = [],
}: ToolInfoRailProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const activeTone = TONES[accent];
  const slide = carousel[slideIndex];

  useEffect(() => {
    if (carousel.length < 2) return;
    const timer = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % carousel.length);
    }, 3800);
    return () => window.clearInterval(timer);
  }, [carousel.length]);

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-xl border border-white/10 bg-zinc-950/80 p-4 shadow-2xl shadow-black/35">
        <div className={cx("pointer-events-none absolute inset-0 bg-gradient-to-br", activeTone.glow)} aria-hidden />
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-white/5 blur-3xl" aria-hidden />
        <div className="relative">
          <p className={cx("text-xs font-black uppercase tracking-[0.18em]", activeTone.text)}>{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-black tracking-normal text-white">{title}</h2>
          {description ? <p className="mt-2 text-sm leading-6 text-zinc-300">{description}</p> : null}

          <div className="mt-5 space-y-2">
            {steps.map((step, index) => {
              const tone = TONES[step.tone || accent];
              return (
                <div key={`${step.title}-${index}`} className={cx("rounded-lg border bg-black/35 p-3", tone.border)}>
                  <div className="flex gap-3">
                    <span className={cx("grid h-8 w-8 flex-shrink-0 place-items-center rounded-full border text-xs font-black", tone.chip)}>
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-black text-white">{step.title}</p>
                      <p className="mt-1 text-xs leading-5 text-neutral-400">{step.body}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {slide ? (
        <section className={cx("relative overflow-hidden rounded-xl border p-4 shadow-2xl shadow-black/30", TONES[slide.tone || accent].panel)}>
          <div className={cx("pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b", TONES[slide.tone || accent].glow)} aria-hidden />
          <div className="relative">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className={cx("text-xs font-black uppercase tracking-[0.18em]", TONES[slide.tone || accent].text)}>{slide.kicker}</p>
              {carousel.length > 1 ? (
                <div className="flex gap-1.5" aria-label="Example flow slides">
                  {carousel.map((item, index) => (
                    <button
                      key={`${item.title}-${index}`}
                      type="button"
                      onClick={() => setSlideIndex(index)}
                      className={cx(
                        "h-2 rounded-full transition",
                        index === slideIndex ? "w-5 bg-cyan-200" : "w-2 bg-white/25 hover:bg-white/45",
                      )}
                      aria-label={`Show ${item.title}`}
                    />
                  ))}
                </div>
              ) : null}
            </div>
            <h3 className="text-lg font-black text-white">{slide.title}</h3>
            <p className="mt-2 text-sm leading-6 text-neutral-300">{slide.body}</p>
            {slide.chips?.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {slide.chips.map((chip) => (
                  <span key={chip} className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[11px] font-bold text-neutral-200">
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {faq.length ? (
        <section className="rounded-xl border border-white/10 bg-zinc-950/75 p-4 shadow-2xl shadow-black/30">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-purple-200">FAQ</p>
          <div className="mt-4 space-y-4">
            {faq.map((item) => (
              <div key={item.q}>
                <p className="text-sm font-black text-purple-100">{item.q}</p>
                <p className="mt-1 text-sm leading-6 text-neutral-300">{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {related.length ? (
        <section className="rounded-xl border border-white/10 bg-zinc-950/75 p-4 shadow-2xl shadow-black/30">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">Related tools</p>
          <div className="mt-3 grid gap-2">
            {related.map((item) => {
              const tone = TONES[item.tone || accent];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cx("rounded-lg border bg-black/35 p-3 transition hover:-translate-y-0.5 hover:bg-black/20", tone.border, tone.soft)}
                >
                  <span className="block text-sm font-black text-white">{item.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-neutral-400">{item.sub}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
