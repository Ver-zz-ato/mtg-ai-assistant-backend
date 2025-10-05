import React from 'react';

export default function RefundPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 prose prose-invert">
      <h1>Refund & Cancellation Policy</h1>
      <p><strong>Effective date:</strong> October 2025</p>

      <p>ManaTap.ai offers both free and paid features. Paid features ("Pro") are billed through Stripe, our secure payment processor.</p>

      <h2>Subscriptions</h2>
      <p>Pro subscriptions are billed either monthly or yearly.</p>
      <p>You can cancel at any time from your Stripe billing portal — a link is provided in your confirmation email and within your account settings. When you cancel, access continues until the end of your current billing period.</p>

      <h2>Refunds</h2>
      <p>We want you to be happy with the service.</p>
      <p>If you are a new Pro subscriber, you may request a refund within 14 days of your first payment, provided the service has not been substantially used.</p>
      <p>Refunds are issued to the original payment method.</p>
      <p>To request a refund, contact <a href="mailto:support@manatap.ai">support@manatap.ai</a> with your Stripe receipt or account email.</p>
      <p>Donations or voluntary tips (through Ko-fi or PayPal) are non-refundable.</p>

      <h2>Failed or disputed payments</h2>
      <p>If a payment fails or is disputed, we may temporarily suspend Pro access until the issue is resolved. Stripe handles all card data securely; ManaTap never stores payment information.</p>

      <h2>Legal</h2>
      <p>All prices include any applicable UK taxes.</p>
      <p>This policy is governed by the laws of England and Wales.</p>
      <p>For more information about Stripe's refund process, visit: <a href="https://support.stripe.com/topics/refunds?locale=en-GB" target="_blank" rel="noreferrer">https://support.stripe.com/topics/refunds?locale=en-GB</a></p>
    </div>
  );
}