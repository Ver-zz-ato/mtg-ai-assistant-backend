// app/new-deck/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const user = u?.user;
  if (!user) {
    redirect("/my-decks");
  }

  const { data, error } = await supabase
    .from("decks")
    .insert({
      user_id: user.id,
      title: "Untitled Deck",
      format: "Commander",
      plan: "Optimized",
      colors: [],
      currency: "USD",
      deck_text: "",
      is_public: false,
      public: false
    })
    .select("id")
    .single();

  // On any error, just send them back to the list.
  if (error || !data?.id) {
    redirect("/my-decks");
  }

  redirect(`/my-decks/${data.id}`);
}
