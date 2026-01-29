import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/server-supabase";

type SearchParams = { authorization_id?: string };

export const dynamic = "force-dynamic";

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const authorizationId = params?.authorization_id?.trim();

  if (!authorizationId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 p-4">
        <div className="max-w-md w-full rounded-xl border border-red-900/50 bg-red-950/20 p-6 text-center">
          <p className="text-red-300 font-medium">Invalid authorization request</p>
          <p className="text-sm text-neutral-400 mt-2">Missing authorization_id. Make sure you followed the link from the application.</p>
          <Link href="/" className="mt-4 inline-block text-sm text-emerald-400 hover:underline">← Back to ManaTap</Link>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const redirectUrl = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/login?redirect=${encodeURIComponent(redirectUrl)}`);
  }

  const oauth = (supabase.auth as any).oauth;
  if (!oauth?.getAuthorizationDetails) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 p-4">
        <div className="max-w-md w-full rounded-xl border border-amber-900/50 bg-amber-950/20 p-6 text-center">
          <p className="text-amber-300 font-medium">OAuth not available</p>
          <p className="text-sm text-neutral-400 mt-2">OAuth Server requires a recent Supabase client. Please update @supabase/supabase-js.</p>
          <Link href="/" className="mt-4 inline-block text-sm text-emerald-400 hover:underline">← Back to ManaTap</Link>
        </div>
      </div>
    );
  }

  const { data: authDetails, error } = await oauth.getAuthorizationDetails(authorizationId);

  if (error || !authDetails) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950 p-4">
        <div className="max-w-md w-full rounded-xl border border-red-900/50 bg-red-950/20 p-6 text-center">
          <p className="text-red-300 font-medium">Authorization error</p>
          <p className="text-sm text-neutral-400 mt-2">{error?.message ?? "Invalid or expired authorization request."}</p>
          <Link href="/" className="mt-4 inline-block text-sm text-emerald-400 hover:underline">← Back to ManaTap</Link>
        </div>
      </div>
    );
  }

  const clientName = (authDetails.client as any)?.name ?? "Unknown app";
  const redirectUri = (authDetails as any).redirect_uri ?? "";
  const scopes = Array.isArray((authDetails as any).scopes) ? (authDetails as any).scopes : [];

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 p-4">
      <div className="max-w-lg w-full rounded-2xl border border-neutral-800 bg-neutral-900/80 p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-2xl">
            🔐
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Authorize {clientName}</h1>
            <p className="text-sm text-neutral-400">This application wants to access your ManaTap account.</p>
          </div>
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <span className="text-neutral-500">Application:</span>
            <span className="ml-2 text-white font-medium">{clientName}</span>
          </div>
          {redirectUri && (
            <div>
              <span className="text-neutral-500">Redirect URI:</span>
              <p className="mt-1 text-neutral-300 font-mono text-xs break-all">{redirectUri}</p>
            </div>
          )}
          {scopes.length > 0 && (
            <div>
              <span className="text-neutral-500">Requested permissions:</span>
              <ul className="mt-2 list-disc list-inside text-neutral-300 space-y-1">
                {scopes.map((scope: string) => (
                  <li key={scope}>{scope}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <form action="/api/oauth/decision" method="POST" className="mt-6 flex flex-col sm:flex-row gap-3">
          <input type="hidden" name="authorization_id" value={authorizationId} />
          <button
            type="submit"
            name="decision"
            value="approve"
            className="flex-1 px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
          >
            Approve
          </button>
          <button
            type="submit"
            name="decision"
            value="deny"
            className="flex-1 px-4 py-3 rounded-lg border border-neutral-600 hover:bg-neutral-800 text-neutral-300 font-medium transition-colors"
          >
            Deny
          </button>
        </form>

        <p className="mt-4 text-xs text-neutral-500 text-center">
          By approving, you allow this app to access your account according to the permissions above.
        </p>
        <Link href="/" className="mt-4 block text-center text-sm text-neutral-400 hover:text-emerald-400 transition-colors">
          ← Back to ManaTap
        </Link>
      </div>
    </div>
  );
}
