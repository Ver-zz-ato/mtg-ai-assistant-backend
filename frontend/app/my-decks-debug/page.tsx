// Debug version of my-decks to isolate the issue
import { createClient } from "@/lib/supabase/server";

export default async function DebugMyDecks() {
  try {
    const supabase = await createClient();
    const { data: user, error: userError } = await supabase.auth.getUser();
    
    if (userError) {
      return (
        <div className="p-6">
          <h1>Debug My Decks - User Error</h1>
          <pre className="bg-red-100 p-4 rounded">{JSON.stringify(userError, null, 2)}</pre>
        </div>
      );
    }

    if (!user?.user) {
      return (
        <div className="p-6">
          <h1>Debug My Decks - Not Authenticated</h1>
          <p>No user found. Please log in.</p>
          <a href="/login" className="underline">Go to Login</a>
        </div>
      );
    }

    // Try to get decks
    const { data: decks, error: decksError } = await supabase
      .from("decks")
      .select("id, title, commander, created_at")
      .eq("user_id", user.user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (decksError) {
      return (
        <div className="p-6">
          <h1>Debug My Decks - Database Error</h1>
          <pre className="bg-red-100 p-4 rounded">{JSON.stringify(decksError, null, 2)}</pre>
        </div>
      );
    }

    return (
      <div className="p-6">
        <h1>Debug My Decks - Success!</h1>
        <p>User ID: {user.user.id}</p>
        <p>Email: {user.user.email}</p>
        <p>Found {decks?.length || 0} decks</p>
        
        <div className="mt-4">
          <h2 className="font-bold">Decks:</h2>
          {decks?.map((deck) => (
            <div key={deck.id} className="border p-2 m-2">
              <div>Title: {deck.title || 'Untitled'}</div>
              <div>ID: {deck.id}</div>
              <div>Commander: {deck.commander || 'None'}</div>
              <div>Created: {deck.created_at}</div>
            </div>
          ))}
        </div>
        
        <div className="mt-4">
          <a href="/my-decks" className="underline">Try original my-decks page</a>
        </div>
      </div>
    );
  } catch (error: any) {
    return (
      <div className="p-6">
        <h1>Debug My Decks - Unexpected Error</h1>
        <pre className="bg-red-100 p-4 rounded">{error?.message || String(error)}</pre>
        <pre className="bg-gray-100 p-4 rounded mt-2">{error?.stack}</pre>
      </div>
    );
  }
}