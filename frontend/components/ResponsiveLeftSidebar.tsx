"use client";

import { useEffect, useState } from "react";

type ResponsiveLeftSidebarProps = {
  children: React.ReactNode;
};

export default function ResponsiveLeftSidebar({ children }: ResponsiveLeftSidebarProps) {
  const [isMdOrUp, setIsMdOrUp] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = () => setIsMdOrUp(mq.matches);
    setIsMdOrUp(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (!isMdOrUp) {
    return null;
  }

  return (
    <aside className="md:col-span-2 space-y-4">
      {children}
    </aside>
  );
}
