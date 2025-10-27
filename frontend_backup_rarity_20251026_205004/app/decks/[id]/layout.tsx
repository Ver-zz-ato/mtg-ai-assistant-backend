// app/decks/[id]/layout.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DeckLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>; // Next 15: params is a Promise
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: deck } = await supabase
      .from("decks")
      .select("id, user_id")
      .eq("id", id)
      .maybeSingle();

    if (deck && deck.user_id === user.id) {
      // Owner? Send them to the full editor view.
      redirect(`/my-decks/${id}`);
    }
  }

  // Not the owner (or not signed in): show the normal read-only deck page.
  return <>{children}</>;
}
