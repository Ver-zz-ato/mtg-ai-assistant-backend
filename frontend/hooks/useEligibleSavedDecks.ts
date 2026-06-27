"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  enrichSavedDeckRow,
  filterEligibleSavedDecks,
  getSavedDeckTargetCount,
  type SavedDeckPickerRow,
} from "@/lib/deck/tool-deck-eligibility";

type EligibleSavedDeckOptions = {
  incompleteOnly?: boolean;
};

export function useEligibleSavedDecks(
  userId: string | null | undefined,
  options: EligibleSavedDeckOptions = {}
) {
  const [eligibleDecks, setEligibleDecks] = useState<SavedDeckPickerRow[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const incompleteOnly = options.incompleteOnly ?? false;

  useEffect(() => {
    if (!userId) {
      setEligibleDecks([]);
      setHiddenCount(0);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const sb = createBrowserSupabaseClient();
        const { data } = await sb
          .from("decks")
          .select("id,title,format,commander,deck_text")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(100);
        if (!alive) return;
        const enriched = (data ?? [])
          .map((row) => enrichSavedDeckRow(row as Parameters<typeof enrichSavedDeckRow>[0]))
          .filter((row): row is SavedDeckPickerRow => row != null);
        const filtered = filterEligibleSavedDecks(enriched);
        const eligible = incompleteOnly
          ? filtered.eligible.filter((row) => row.cardCount < getSavedDeckTargetCount(row.format))
          : filtered.eligible;
        setEligibleDecks(eligible);
        setHiddenCount(filtered.hiddenCount + (filtered.eligible.length - eligible.length));
      } catch {
        if (!alive) return;
        setEligibleDecks([]);
        setHiddenCount(0);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [userId, incompleteOnly]);

  return { eligibleDecks, hiddenCount, loading };
}
