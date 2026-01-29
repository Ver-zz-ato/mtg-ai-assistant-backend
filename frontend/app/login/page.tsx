import Link from "next/link";
import { createClient } from "@/lib/server-supabase";
import { redirect } from "next/navigation";

type SearchParams = { redirect?: string };

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const redirectTo = params?.redirect?.trim();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && redirectTo) {
    redirect(redirectTo);
  }

  const homeUrl = redirectTo
    ? `/?oauth_redirect=${encodeURIComponent(redirectTo)}`
    : "/";

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 p-4">
      <div className="max-w-md w-full rounded-2xl border border-neutral-800 bg-neutral-900/80 p-8 shadow-xl text-center">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-3xl mx-auto mb-4">
          🔐
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Sign in required</h1>
        <p className="text-neutral-400 text-sm mb-6">
          {redirectTo
            ? "Sign in to authorize this app to access your ManaTap account."
            : "Sign in to continue to ManaTap."}
        </p>
        <Link
          href={homeUrl}
          className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
        >
          Sign in
        </Link>
        <p className="mt-4 text-xs text-neutral-500">
          You&apos;ll sign in on the home page, then we&apos;ll redirect you back.
        </p>
      </div>
    </div>
  );
}
