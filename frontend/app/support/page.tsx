import React from 'react';

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 prose prose-invert">
      <h1>Support</h1>
      
      <h2>About ManaTap.ai</h2>
      <p>ManaTap.ai is an independent, community-built project created by Davy Seits — a long-time Magic: The Gathering player and tinkerer who wanted smarter, more transparent deck tools.</p>
      
      <p>The app uses AI to analyse deck costs, simulate draws, and suggest budget swaps — helping players understand and refine their decks rather than replace their creativity. ManaTap is not affiliated with or endorsed by Wizards of the Coast; it's a personal project made for the player community.</p>

      <h2>Core Features</h2>
      <ul>
        <li><strong>Cost-to-Finish</strong> — see exactly what your deck still needs and what it costs.</li>
        <li><strong>Budget Swaps</strong> — find cheaper equivalents without ruining synergy.</li>
        <li><strong>Mulligan & Probability Helpers</strong> — test opening hands and odds.</li>
        <li><strong>Price Tracker</strong> — watch for spikes and dips in real time.</li>
        <li><strong>In-depth deck builder</strong> - manage and tweak decks</li>
        <li><strong>Custom Card Creator</strong> - create your very own MTG custom card - no affiliation to Wizards of The Coast.</li>
        <li><strong>Profile</strong> - Show off your decks, custom cards and more!</li>
      </ul>

      <h2>Technology</h2>
      <p>ManaTap runs on a modern stack (Next.js 15, Supabase, and OpenAI GPT-5) and is hosted on Vercel (frontend) and Render (backend). It's designed to be transparent, privacy-respecting, and fast.</p>

      <h2>Support</h2>
      <p>Questions, bug reports, or ideas?</p>
      <p>📧 Email <a href="mailto:davy@manatap.ai">davy@manatap.ai</a></p>
      <p>We usually reply within two business days.</p>
    </div>
  );
}