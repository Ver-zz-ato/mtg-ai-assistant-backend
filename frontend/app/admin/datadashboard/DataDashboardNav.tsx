"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin/datadashboard", label: "Overview" },
  { href: "/admin/datadashboard/suggestions", label: "Suggestions" },
  { href: "/admin/datadashboard/deck-metrics", label: "Deck Metrics" },
  { href: "/admin/datadashboard/meta-trends", label: "Meta Trends" },
  { href: "/admin/datadashboard/test", label: "Test" },
];

export default function DataDashboardNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2 mb-4">
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`px-3 py-1.5 rounded text-sm ${
            pathname === href
              ? "bg-neutral-700 text-white"
              : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
