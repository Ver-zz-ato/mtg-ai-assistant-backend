import "server-only";

import { getAdmin } from "@/app/api/_lib/supa";

export type AnalysisSnapshot = {
  title?: string;
  result?: {
    ok?: boolean;
    summary?: string;
    score?: number;
    issues?: string[];
    fixes?: string[];
    priority?: string[];
    whatsGood?: string[];
    suggestions?: { card?: string; reason?: string; category?: string }[];
    analysis?: {
      summary?: string | null;
      archetype?: string | null;
      game_plan?: string | null;
      main_problems?: string[];
      priority_actions?: string[];
    } | null;
  };
};

export type HealthSnapshot = {
  title?: string;
  format?: string;
  commander?: string | null;
  free?: {
    signals?: { id: string; title: string; description: string; level: string }[];
    tips?: string[];
  };
  pro?: {
    overview?: string;
    biggestIssues?: string[];
    priorityFixPlan?: string[];
    suggestedAdds?: string[];
    suggestedCuts?: string[];
  };
};

export type SharedReport<TSnapshot> = {
  id: string;
  snapshot_json: TSnapshot;
  created_at: string;
  expires_at: string;
};

export async function getSharedAnalysisReport(id: string): Promise<SharedReport<AnalysisSnapshot> | null> {
  const admin = getAdmin();
  if (!admin) return null;

  const { data } = await admin
    .from("shared_analysis_reports")
    .select("id, snapshot_json, created_at, expires_at")
    .eq("id", id)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  return data as SharedReport<AnalysisSnapshot> | null;
}

export async function getSharedHealthReport(id: string): Promise<SharedReport<HealthSnapshot> | null> {
  const admin = getAdmin();
  if (!admin) return null;

  const { data } = await admin
    .from("shared_health_reports")
    .select("id, snapshot_json, created_at, expires_at")
    .eq("id", id)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  return data as SharedReport<HealthSnapshot> | null;
}
