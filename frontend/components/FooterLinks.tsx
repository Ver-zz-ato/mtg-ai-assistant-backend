"use client";
import React from "react";

type MonetizeConfig = { stripe: boolean; kofi: boolean; paypal: boolean };

export default function FooterLinks() {
  const [cfg, setCfg] = React.useState<MonetizeConfig>({ stripe: true, kofi: true, paypal: true });
  React.useEffect(() => {
    let done = false;
    (async () => {
      try {
        const r = await fetch('/api/config', { cache: 'no-store' });
        const j = await r.json().catch(()=>({}));
        if (r.ok && j?.ok && j?.monetize && !done) setCfg({
          stripe: !!j.monetize.stripe,
          kofi: !!j.monetize.kofi,
          paypal: !!j.monetize.paypal,
        });
      } catch {}
    })();
    return () => { done = true; };
  }, []);

  return (
    <>
      <a className="hover:text-gray-200" href="/support">Support</a>
      {cfg.stripe && (<a className="hover:text-gray-200" href="https://buy.stripe.com/14A4gAdle89v3XE61q4AU01" target="_blank" rel="noreferrer">Stripe</a>)}
      {cfg.kofi && (<a className="hover:text-gray-200" href="https://ko-fi.com/davydraws7/tip" target="_blank" rel="noreferrer">Ko‑fi</a>)}
      {cfg.paypal && (<a className="hover:text-gray-200" href="https://paypal.me/DavyDraws7" target="_blank" rel="noreferrer">PayPal</a>)}
      <a className="hover:text-gray-200" href="/terms">Terms</a>
      <a className="hover:text-gray-200" href="/privacy">Privacy</a>
      <a className="hover:text-gray-200" href="/refund">Refund Policy</a>

      <div className="w-full">
        <div className="text-[10px] leading-snug opacity-70 max-w-5xl">
          <p>
            Wizards of the Coast, Magic: The Gathering, and their logos are trademarks of Wizards of the Coast LLC in the United States and other countries. © 1993-2025 Wizards. All Rights Reserved.
          </p>
          <p className="mt-2">
            Manatap.ai is not affiliated with, endorsed, sponsored, or specifically approved by Wizards of the Coast LLC. Manatap.ai may use the trademarks and other intellectual property of Wizards of the Coast LLC, which is permitted under Wizards' Fan Site Policy. MAGIC: THE GATHERING® is a trademark of Wizards of the Coast. For more information about Wizards of the Coast or any of Wizards' trademarks or other intellectual property, please visit their website at
            {' '}<a className="underline hover:text-gray-200" href="https://company.wizards.com/" target="_blank" rel="noreferrer">https://company.wizards.com/</a>.
          </p>
          <p className="mt-2">
            Some card prices and other card data are provided by
            {' '}<a className="underline hover:text-gray-200" href="https://scryfall.com/" target="_blank" rel="noreferrer">Scryfall</a>.
            {' '}Scryfall makes no guarantee about its price information and recommends you see stores for final prices and details.
          </p>
        </div>
      </div>
    </>
  );
}
