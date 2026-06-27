"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const APP_SCREENSHOTS = [
  {
    src: "/app-screenshots/screenshot1-overview.png",
    alt: "ManaTap mobile app overview",
  },
  {
    src: "/app-screenshots/screenshot2-playstyle-quiz.png",
    alt: "ManaTap playstyle quiz screen",
  },
  {
    src: "/app-screenshots/screenshot3-deck-compare.png",
    alt: "ManaTap deck comparison screen",
  },
  {
    src: "/app-screenshots/screenshot4-analyze-deck.png",
    alt: "ManaTap deck checker screen",
  },
  {
    src: "/app-screenshots/screenshot5-life-counter.png",
    alt: "ManaTap life counter screen",
  },
  {
    src: "/app-screenshots/screenshot6-chat.png",
    alt: "ManaTap chat screen",
  },
  {
    src: "/app-screenshots/screenshot7-tournament.png",
    alt: "ManaTap tournament screen",
  },
  {
    src: "/app-screenshots/screenshot8-ready-to-build.png",
    alt: "ManaTap ready to build screen",
  },
];

type AppScreenshotCarouselProps = {
  className?: string;
  frameClassName?: string;
  imageClassName?: string;
  intervalMs?: number;
  sizes?: string;
};

export default function AppScreenshotCarousel({
  className = "",
  frameClassName = "",
  imageClassName = "",
  intervalMs = 5000,
  sizes = "(min-width: 1024px) 360px, 80vw",
}: AppScreenshotCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % APP_SCREENSHOTS.length);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return (
    <div className={className}>
      <div
        className={`relative aspect-[941/1672] overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl shadow-black/45 ${frameClassName}`}
      >
        {APP_SCREENSHOTS.map((screenshot, index) => (
          <Image
            key={screenshot.src}
            src={screenshot.src}
            alt={screenshot.alt}
            fill
            sizes={sizes}
            priority={index === 0}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
              index === activeIndex ? "opacity-100" : "opacity-0"
            } ${imageClassName}`}
          />
        ))}
      </div>
    </div>
  );
}
