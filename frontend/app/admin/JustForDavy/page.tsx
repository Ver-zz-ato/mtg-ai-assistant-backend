'use client';
import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

function Pill({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="px-3 py-1.5 rounded-full border border-neutral-700 hover:bg-neutral-900 text-sm">
      {children}
    </Link>
  );
}

type Section = {
  title: string;
  eli5: string;
  links: { href: string; label: string; eli5?: string }[];
};

const SECTIONS: Section[] = [
  {
    title: 'Daily Ops',
    eli5: 'The main control panel. Turn features on/off, put the site in maintenance mode, set spending limits, run background jobs, and undo bad changes.',
    links: [
      { href: '/admin/ops', label: 'Ops & Safety', eli5: 'Feature toggles, maintenance mode, AI budget caps, cron jobs (deck costs, commander data), and snapshot rollback.' },
    ],
  },
  {
    title: 'Card Data & Prices',
    eli5: 'Everything about the card database and prices. Check if card info is up to date, run big update jobs, and see how prices have changed.',
    links: [
      { href: '/admin/data', label: 'Data & Pricing', eli5: 'Look up cards in the cache, run Scryfall/price imports, see price change heatmaps.' },
      { href: '/admin/budget-swaps', label: 'Budget Swaps', eli5: 'Manage which cheaper cards get suggested as replacements for expensive ones.' },
    ],
  },
  {
    title: 'AI',
    eli5: 'Make the AI smarter and keep it healthy. Edit how it thinks, test if it works, see how much it costs, and tune chat behavior.',
    links: [
      { href: '/admin/ai-health', label: 'AI Health', eli5: 'Quick check: Is the AI working? Why might chat say "temporarily unavailable"?' },
      { href: '/admin/ai', label: 'AI & Chat Quality', eli5: 'Edit prompts, toggle canned answers (combo checks, rules), set moderation allow/block lists, see usage.' },
      { href: '/admin/ai-usage', label: 'AI Usage & Cost', eli5: 'How much are we spending on AI? Which features cost the most? Price snapshots.' },
      { href: '/admin/chat-levers', label: 'Chat Levers', eli5: 'Defaults, answer packs, rules tuning, model/cost policy.' },
      { href: '/admin/ai-test', label: 'AI Test Suite', eli5: 'Run test cases against the AI, compare prompt versions, find failures.' },
      { href: '/admin/mulligan-ai', label: 'Mulligan AI Playground', eli5: 'Test AI mulligan advice flow before homepage. Paste deck, draw hand, get keep/mulligan advice.' },
      { href: '/admin/mulligan-analytics', label: 'Mulligan Analytics', eli5: 'Usage by tier (guest/free/pro), repeat users, daily breakdown. PostHog mulligan_* events.' },
    ],
  },
  {
    title: 'Users & Support',
    eli5: 'Help users with their accounts. Look someone up, grant Pro, resend verification, export or delete their data (GDPR).',
    links: [
      { href: '/admin/support', label: 'User Support', eli5: 'Search users, grant/revoke Pro, resend verification, GDPR export/delete.' },
    ],
  },
  {
    title: 'Monitoring',
    eli5: 'See what\'s happening in the app. Event stream, rate limits, errors, and whether analytics/tracking is working.',
    links: [
      { href: '/admin/obs', label: 'Observability', eli5: 'Live-ish event feed, who\'s hitting rate limits, recent errors.' },
      { href: '/admin/events', label: 'Events Debug', eli5: 'How many Probability runs, Mulligan iterations, badge progress.' },
      { href: '/admin/analytics-debug', label: 'Analytics Debug', eli5: 'Is PostHog loaded? Consent status? Recent events. For fixing tracking issues.' },
    ],
  },
  {
    title: 'Business & Growth',
    eli5: 'Money, SEO, and announcements. Payment toggles, conversion stats, pages that rank on Google, and What\'s New.',
    links: [
      { href: '/admin/monetize', label: 'Monetization', eli5: 'Turn Stripe/Ko-fi/PayPal on or off, see subscribers, promo bar.' },
      { href: '/admin/pricing', label: 'Pricing & Conversion', eli5: 'Page views, upgrade clicks, signups, Pro conversions, revenue.' },
      { href: '/admin/attribution', label: 'Attribution & Funnels', eli5: 'First-touch attribution: which landing pages and referrers lead to AI usage, repeat usage, and commander funnels.' },
      { href: '/admin/seo/pages', label: 'SEO Landing Pages', eli5: 'Pages that show up on Google. Find winners (getting impressions but not indexed), publish them, manage /q/[slug] pages.' },
      { href: '/admin/changelog', label: 'Changelog', eli5: 'Manage What\'s New entries and version releases.' },
    ],
  },
  {
    title: 'Security & Infrastructure',
    eli5: 'Keep things safe and backed up. Audit log, security tests, backups, and deployment info.',
    links: [
      { href: '/admin/security', label: 'Security & Compliance', eli5: 'Who did what in admin, CSP tester, key rotation.' },
      { href: '/admin/backups', label: 'Database Backups', eli5: 'Backup status, manual backup, test restore.' },
      { href: '/admin/deploy', label: 'Deployment', eli5: 'Current version, perf budgets, roadmap.' },
    ],
  },
  {
    title: 'Other',
    eli5: 'Misc tools. Badge counts, bulk deck import, analytics seeding.',
    links: [
      { href: '/admin/badges', label: 'Badges', eli5: 'Rough counts for Probability/Mulligan badges.' },
      { href: '/admin/decks/import', label: 'Bulk Import Decks', eli5: 'Upload CSV to add public decks. No web scraping — you provide the data.' },
      { href: '/admin/analytics-seed', label: 'Analytics Seed', eli5: 'One-time: fire sample events so PostHog knows the taxonomy. Safe to skip.' },
    ],
  },
];

export default function AdminHub() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  const [checking, setChecking] = React.useState(true);

  React.useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push('/');
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/admin/config', { cache: 'no-store' });
        const data = await res.json();
        if (data.ok && data.is_admin) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
          router.push('/');
        }
      } catch (err) {
        console.error('Admin check failed:', err);
        setIsAdmin(false);
        router.push('/');
      } finally {
        setChecking(false);
      }
    })();
  }, [user, authLoading, router]);

  if (authLoading || checking || isAdmin === null) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-neutral-400">Checking admin access...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-xl mb-2">Access Denied</p>
          <p className="text-neutral-400">Admin access required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      <header className="space-y-1">
        <div className="text-xl font-semibold">Admin • JustForDavy</div>
        <p className="text-sm opacity-80">Central hub for running the app, data, AI, users, monitoring, and growth.</p>
      </header>

      {/* Quick pills - all links */}
      <nav className="flex flex-wrap gap-2">
        {SECTIONS.flatMap((s) => s.links).map((l) => (
          <Pill key={l.href} href={l.href}>{l.label}</Pill>
        ))}
      </nav>

      {/* Grouped sections with ELI5 */}
      <section className="space-y-6">
        {SECTIONS.map((sec) => (
          <div key={sec.title} className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4 space-y-3">
            <div>
              <h2 className="font-semibold text-neutral-100">{sec.title}</h2>
              <p className="text-sm text-neutral-400 mt-0.5">{sec.eli5}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sec.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="rounded border border-neutral-700 p-3 hover:bg-neutral-800 hover:border-neutral-600 transition-colors"
                >
                  <div className="font-medium text-sm text-neutral-200">{l.label}</div>
                  {l.eli5 && (
                    <p className="text-xs text-neutral-500 mt-1">{l.eli5}</p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
