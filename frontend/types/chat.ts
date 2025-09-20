// Shared chat types used across components and API routes

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string | number;
  thread_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
};

// Minimal thread summary shape for dropdowns / lists
export type ThreadSummary = {
  id: string;
  title: string | null;
  deck_id?: string | null;
  created_at: string;
};

// Full thread shape used by lib/threads helpers
export type ChatThread = {
  id: string;
  title: string | null;
  deck_id?: string | null;
  created_at: string;
  messages?: ChatMessage[]; // optional; many APIs return messages separately
};
