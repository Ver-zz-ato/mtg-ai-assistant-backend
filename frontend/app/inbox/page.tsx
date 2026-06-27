import type { Metadata } from "next";
import InboxClient from "./InboxClient";

export const metadata: Metadata = {
  title: "Inbox | ManaTap",
  description: "Comments and replies on your public ManaTap decks, collections, roasts, reports, and custom cards.",
  alternates: { canonical: "https://www.manatap.ai/inbox" },
};

export default function InboxPage() {
  return <InboxClient />;
}
