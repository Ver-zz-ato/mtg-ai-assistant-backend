// app/wishlist/[id]/page.tsx
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import PublicWishlistCardList from "@/components/PublicWishlistCardList";

type Params = { id: string };
export const revalidate = 120; // short ISR window for public wishlists

// Generate dynamic metadata for public wishlist pages
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  
  const { data: wishlist } = await supabase
    .from("wishlists")
    .select("name, is_public")
    .eq("id", id)
    .maybeSingle();
  
  if (!wishlist || !wishlist.is_public) {
    return {
      title: "Wishlist Not Found | ManaTap.ai",
      description: "This wishlist is not available or is set to private.",
    };
  }
  
  const title = wishlist.name || "Untitled Wishlist";
  const description = `View this Magic: The Gathering wishlist on ManaTap.ai. See card prices and build your collection.`;
  
  const canonicalUrl = `https://www.manatap.ai/wishlist/${id}`;
  
  return {
    title: `${title} | ManaTap.ai`,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${title} | ManaTap.ai`,
      description,
      type: "website",
      url: canonicalUrl,
      siteName: "ManaTap.ai",
      locale: "en_US",
    },
    twitter: {
      card: "summary",
      title: `${title} | ManaTap.ai`,
      description,
    },
  };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const supabase = await createClient();
  
  // Check if user is authenticated (for showing wishlist ID)
  const { data: { user } } = await supabase.auth.getUser();

  function norm(name: string): string {
    return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  }

  // Fetch wishlist meta (public visibility enforced by RLS)
  const { data: wishlistRow } = await supabase
    .from("wishlists")
    .select("name, is_public, user_id")
    .eq("id", id)
    .maybeSingle();
  
  if (!wishlistRow || !wishlistRow.is_public) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-xl font-semibold mb-2">Wishlist not found</h1>
        <p className="opacity-80">This wishlist either does not exist or is not publicly visible.</p>
        <p className="mt-4"><a className="underline" href="/wishlist">Back to Wishlists</a></p>
      </div>
    );
  }

  const title = wishlistRow.name || "Wishlist";
  const isOwner = user?.id && wishlistRow.user_id === user.id;

  // Fetch wishlist items
  const { data: items } = await supabase
    .from("wishlist_items")
    .select("name, qty")
    .eq("wishlist_id", id)
    .order("name", { ascending: true });

  // Snapshot prices for per-card display (USD default)
  const names = Array.from(new Set(((items || []) as any[]).map(i => String(i.name))));
  let priceMap = new Map<string, number>();
  try {
    if (names.length) {
      const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/price/snapshot`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ names, currency: 'USD' })
      });
      const j: any = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) {
        const obj = j.prices || {};
        Object.entries(obj).forEach(([k, v]: any) => {
          priceMap.set(String(k).toLowerCase(), Number(v));
        });
      }
    }
  } catch {}

  const totalCards = ((items || []) as any[]).reduce((sum, item) => sum + (item.qty || 1), 0);
  const uniqueCards = names.length;

  return (
    <main className="min-h-screen bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-12 gap-6">
          <section className="col-span-12 lg:col-span-9">
            {/* Header */}
            <header className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{title}</h1>
                  <p className="text-neutral-400 text-sm">
                    Public Wishlist • {totalCards} card{totalCards !== 1 ? 's' : ''} ({uniqueCards} unique)
                  </p>
                </div>
                {isOwner && (
                  <a
                    href={`/wishlist?wishlistId=${id}`}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white text-sm font-medium transition-all shadow-md hover:shadow-lg"
                  >
                    Edit Wishlist
                  </a>
                )}
              </div>
            </header>

            {/* Wishlist Cards */}
            <div className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 p-6 shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-1 w-1 rounded-full bg-violet-400 animate-pulse shadow-lg shadow-violet-400/50"></div>
                <h2 className="text-base font-bold bg-gradient-to-r from-violet-400 to-purple-500 bg-clip-text text-transparent">
                  Wishlist ({totalCards} cards)
                </h2>
              </div>
              <PublicWishlistCardList items={items || []} priceMap={priceMap} />
            </div>
          </section>

          {/* Right sidebar - Value summary */}
          <aside className="col-span-12 lg:col-span-3 space-y-4">
            <div className="rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 p-5 shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-1 w-1 rounded-full bg-green-400 animate-pulse shadow-lg shadow-green-400/50"></div>
                <h2 className="text-base font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
                  Estimated Value
                </h2>
              </div>
              <div className="text-2xl font-mono font-semibold text-green-400 mb-2">
                ${Array.from(priceMap.values()).reduce((sum, price, idx) => {
                  const item = (items || [])[idx];
                  return sum + (price * (item?.qty || 1));
                }, 0).toFixed(2)}
              </div>
              <div className="text-xs text-neutral-400">
                Uses snapshot prices per card in USD
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
