import type { Metadata } from "next";
import GetAppClient from "./GetAppClient";

export const metadata: Metadata = {
  title: "Get ManaTap | MTG App",
  description: "Download ManaTap, the MTG companion app for deck tuning, card scanning, collection tracking, and smarter brews.",
  alternates: { canonical: "https://manatap.ai/get" },
  robots: { index: true, follow: true },
};

export default function GetManaTapPage() {
  return <GetAppClient />;
}
