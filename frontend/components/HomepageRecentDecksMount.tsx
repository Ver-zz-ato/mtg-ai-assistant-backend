"use client";
import React from "react";
import { usePathname } from "next/navigation";
import RecentPublicDecks from "@/components/RecentPublicDecks";

export default function HomepageRecentDecksMount() {
  const pathname = usePathname();
  if (pathname !== "/") return null;
  return (
    <div className="max-w-7xl mx-auto w-full px-4 mt-4">
      <RecentPublicDecks />
    </div>
  );
}
