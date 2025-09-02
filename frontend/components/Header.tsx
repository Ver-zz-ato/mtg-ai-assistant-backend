"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// If desired, you can swap this for: import type { Session } from "@supabase/supabase-js";
type SessionLike = { user?: { id: string; email?: string | null } } | null;

export default function Header() {
  const supabase = createSupabaseBrowserClient();

  const [session, setSession] = useState<SessionLike>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load current session (client-side) and subscribe to auth changes
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) console.error("getSession error:", error);
      setSession(data?.session ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doAuth() {
    setErr(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setOpen(false);
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setOpen(false);
      }
    } catch (e: unknown) {
      console.error("Auth error:", e);
      const message =
        typeof e === "object" && e !== null && "message" in e
          ? String((e as { message?: unknown }).message)
          : "Authentication failed.";
      setErr(message);
    } finally {
      setBusy(false);
    }
  }

  async function doLogout() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("signOut error:", e);
    }
  }

  return (
    <header className="bg-gray-900/90 backdrop-blur sticky top-0 z-50 border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2 mr-auto">
          <div className="h-7 w-7 rounded-md bg-yellow-400/90 text-gray-900 grid place-content-center font-black">M</div>
          <div className="text-lg font-semibold tracking-tight">MTG Coach</div>
        </div>

        {/* (Optional) static mode buttons — your ModeOptions handles the real state */}
        <div className="hidden md:flex items-center gap-2">
          <button className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700">Deck Builder</button>
          <button className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700">Rule Checker</button>
          <button className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700">Price Checker</button>
        </div>

        {/* Auth area */}
        {session?.user ? (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-gray-400 hidden md:inline">
              Signed in as {session.user.email ?? session.user.id.slice(0, 8)}
            </span>
            <a
              href="/my-decks"
              className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm"
              title="View your saved decks"
            >
              My Decks
            </a>
            <button
              onClick={doLogout}
              className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700"
            >
              Logout
            </button>
          </div>
        ) : (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => {
                setMode("signup");
                setErr(null);
                setOpen(true);
              }}
              className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700"
            >
              Signup
            </button>
            <button
              onClick={() => {
                setMode("login");
                setErr(null);
                setOpen(true);
              }}
              className="px-3 py-2 rounded-lg bg-yellow-500 text-gray-900 font-medium hover:bg-yellow-400"
            >
              Login
            </button>
          </div>
        )}
      </div>

      {/* Auth modal */}
      {open && (
        <div
          className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold">{mode === "login" ? "Login" : "Create Account"}</h3>
              <button className="text-gray-400 hover:text-gray-200" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
                placeholder="you@example.com"
              />
              <input
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
                placeholder="Password"
              />
              {err && <div className="text-red-400 text-sm">{err}</div>}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                disabled={busy}
                onClick={doAuth}
                className="px-4 py-2 rounded-lg bg-yellow-500 text-gray-900 font-medium hover:bg-yellow-400 disabled:opacity-50"
              >
                {busy ? "Please wait…" : mode === "login" ? "Login" : "Sign up"}
              </button>

              <button
                className="text-sm text-gray-400 hover:text-gray-200"
                onClick={() => {
                  setMode(mode === "login" ? "signup" : "login");
                  setErr(null);
                }}
              >
                {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
