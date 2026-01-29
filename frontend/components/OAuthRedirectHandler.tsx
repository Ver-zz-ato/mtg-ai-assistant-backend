"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/**
 * When user lands on /?oauth_redirect=... (e.g. from /login), open auth modal
 * and redirect to oauth_redirect after they sign in.
 */
export default function OAuthRedirectHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (loading || hasRedirected.current) return;

    const oauthRedirect = searchParams?.get("oauth_redirect")?.trim();
    if (!oauthRedirect) return;

    if (user) {
      hasRedirected.current = true;
      const url = new URL(window.location.href);
      url.searchParams.delete("oauth_redirect");
      const replace = url.pathname + url.search;
      window.history.replaceState(null, "", replace);
      router.replace(oauthRedirect);
      return;
    }

    // Not logged in: open auth modal (signin)
    try {
      window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { mode: "signin" } }));
    } catch {}
  }, [user, loading, searchParams, router]);

  return null;
}
