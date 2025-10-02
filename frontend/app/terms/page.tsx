import React from 'react';

function formatToday(): string {
  try {
    const d = new Date();
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return new Date().toISOString().slice(0,10);
  }
}

export default function TermsPage() {
  const today = formatToday();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 prose prose-invert">
      <h1>Terms of Service (Manatap.ai)</h1>
      <p><strong>Effective date:</strong> {today}</p>

      <p><strong>By using Manatap.ai, you agree to the following:</strong></p>
      <ul>
        <li><strong>Free project</strong> — Manatap.ai is offered “as is” without guarantees. It may change or stop at any time.</li>
        <li><strong>No liability</strong> — We’re not responsible for losses, damages, or mistakes that come from using the site.</li>
        <li><strong>Fair use</strong> — Don’t abuse the site (e.g. spamming, exploiting the system, or attempting to break security).</li>
        <li><strong>Support/donations</strong> — Any payments through Ko-fi, PayPal, or Stripe are voluntary tips, not purchases. They are non-refundable and don’t entitle you to goods, services, or special treatment.</li>
        <li><strong>Content</strong> — Manatap.ai is not affiliated with or endorsed by Wizards of the Coast. Magic: The Gathering and all related marks are their trademarks.</li>
      </ul>
    </div>
  );
}