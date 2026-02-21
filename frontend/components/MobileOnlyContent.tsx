"use client";

import { useEffect, useState } from "react";

type MobileOnlyContentProps = {
  children: React.ReactNode;
};

/** Renders children only when viewport is below md (768px). Avoids duplicate sidebar content on desktop. */
export default function MobileOnlyContent({ children }: MobileOnlyContentProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = () => setIsMobile(mq.matches);
    setIsMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (!isMobile) {
    return null;
  }

  return <>{children}</>;
}
