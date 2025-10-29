// app/new-deck/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NewDeckClient from "./Client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const user = u?.user;
  
  if (!user) {
    redirect("/my-decks");
  }

  // Render the client component that shows the format picker
  return <NewDeckClient />;
}
