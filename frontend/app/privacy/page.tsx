import React from 'react';

function formatToday(): string {
  try {
    const d = new Date();
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return new Date().toISOString().slice(0,10);
  }
}

export default function PrivacyPage() {
  const today = formatToday();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 prose prose-invert">
      <h1>Privacy Policy (Manatap.ai)</h1>
      <p><strong>Effective date:</strong> {today}</p>
      <p>Manatap.ai is a free, personal project created to help Magic: The Gathering players explore deck ideas and costs.</p>

      <h2>What data we collect</h2>
      <ul>
        <li>Basic usage data (like page visits and actions) through analytics tools (e.g. PostHog).</li>
        <li>Account data if you choose to create one (email, login info via Supabase).</li>
        <li>Payment information if you support the project through Ko-fi, PayPal, or Stripe (these providers process payments; we don’t store card details).</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To keep the site running (analytics help us fix bugs and improve features).</li>
        <li>To process donations (via third-party providers).</li>
        <li>To protect against abuse or misuse of the service.</li>
      </ul>

      <h2>Who we share data with</h2>
      <ul>
        <li>Hosting and database providers (Supabase, Render).</li>
        <li>Payment processors (Ko-fi, PayPal, Stripe).</li>
        <li>Analytics (PostHog).</li>
      </ul>

      <h2>Your rights</h2>
      <p>If you’re in the UK/EU, you can request a copy of your personal data or ask us to delete it. Contact us at <a href="mailto:davy_s@live.nl">davy_s@live.nl</a>.</p>

      <h2>Cookies</h2>
      <p>Manatap.ai uses cookies for login sessions and analytics. By using the site, you consent to this.</p>
    </div>
  );
}