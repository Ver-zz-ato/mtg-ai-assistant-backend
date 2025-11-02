"use client";
import React from "react";

export default function DeckPriceMini({ deckId, initialCurrency = 'USD' }: { deckId: string; initialCurrency?: 'USD'|'EUR'|'GBP' }){
  const [currency, setCurrency] = React.useState<'USD'|'EUR'|'GBP'>(initialCurrency);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string|null>(null);
  const [total, setTotal] = React.useState<number|null>(null);

  async function refresh(){
    try{
      setBusy(true); setError(null);
      const r = await fetch(`/api/decks/cards?deckId=${encodeURIComponent(deckId)}`, { cache:'no-store' });
      const j = await r.json().catch(()=>({}));
      if(!r.ok || j?.ok===false) throw new Error(j?.error||'load failed');
      const items: Array<{ name:string; qty:number }> = Array.isArray(j?.cards)? j.cards : [];
      const names = Array.from(new Set(items.map(i=>i.name)));
      if(!names.length){ setTotal(0); return; }
      
      const norm=(s:string)=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
      
      // Step 1: Try snapshot prices first
      console.log('[DeckPriceMini] Fetching prices for', names.length, 'cards, currency:', currency);
      console.log('[DeckPriceMini] Card names:', names.slice(0, 10));
      const pr = await fetch('/api/price/snapshot', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ names, currency }) });
      const pj = await pr.json().catch(()=>({}));
      let prices: Record<string, number> = (pj?.ok && pj?.prices) ? pj.prices : {};
      console.log('[DeckPriceMini] Snapshot prices:', Object.keys(prices).length, 'prices');
      console.log('[DeckPriceMini] Snapshot price keys:', Object.keys(prices).slice(0, 10));
      
      // Step 2: Fallback to Scryfall live prices for missing cards
      const missingNames = names.filter(name => !prices[norm(name)]);
      console.log('[DeckPriceMini] Missing prices for', missingNames.length, 'cards:', missingNames.slice(0, 5));
      
      if (missingNames.length > 0) {
        try {
          // Process in batches of 75 (Scryfall's limit)
          for (let i = 0; i < missingNames.length; i += 75) {
            const batch = missingNames.slice(i, i + 75);
            console.log('[DeckPriceMini] Scryfall batch', Math.floor(i/75) + 1, '- fetching:', batch.slice(0, 5));
            const identifiers = batch.map(n => ({ name: n }));
            const scryfallRes = await fetch('https://api.scryfall.com/cards/collection', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ identifiers })
            });
            const scryfallData = await scryfallRes.json().catch(() => ({}));
            const cards: any[] = Array.isArray(scryfallData?.data) ? scryfallData.data : [];
            console.log('[DeckPriceMini] Scryfall returned', cards.length, 'cards');
            
            let foundCount = 0;
            for (const card of cards) {
              const cardName = norm(card?.name || '');
              const cardPrices = card?.prices || {};
              const priceKey = currency === 'EUR' ? 'eur' : currency === 'GBP' ? 'gbp' : 'usd';
              
              // Try primary price key first
              let priceValue = cardPrices?.[priceKey];
              
              // For USD, try fallback keys if primary is missing (reserved list cards often only have foil prices)
              if ((!priceValue || priceValue === null || priceValue === 0) && currency === 'USD') {
                priceValue = cardPrices?.usd_foil || cardPrices?.usd_etched || cardPrices?.usd;
              }
              
              // For EUR, try foil fallback
              if ((!priceValue || priceValue === null || priceValue === 0) && currency === 'EUR') {
                priceValue = cardPrices?.eur_foil || cardPrices?.eur;
              }
              
              // For GBP, try foil fallback
              if ((!priceValue || priceValue === null || priceValue === 0) && currency === 'GBP') {
                priceValue = cardPrices?.gbp_foil || cardPrices?.gbp;
              }
              
              if (priceValue != null && priceValue > 0 && !isNaN(Number(priceValue))) {
                prices[cardName] = Number(priceValue);
                foundCount++;
                const priceType = cardPrices?.[priceKey] ? priceKey : (cardPrices?.usd_foil || cardPrices?.eur_foil || cardPrices?.gbp_foil ? 'foil' : 'other');
                console.log('[DeckPriceMini] ✓ Found price for', card.name, '->', cardName, '=', priceValue, currency, `(${priceType})`);
              } else {
                // Log the full price object structure for debugging
                const priceKeys = Object.keys(cardPrices || {}).filter(k => cardPrices[k] != null);
                console.log('[DeckPriceMini] ✗ No price for', card.name, '->', cardName);
                console.log('[DeckPriceMini]   Available price keys:', priceKeys);
                console.log('[DeckPriceMini]   Price values:', priceKeys.map(k => `${k}=${cardPrices[k]}`).join(', '));
                
                // Last resort: try to fetch cheapest printing if this card has prints_search_uri
                // Trigger this if: no price keys at all, OR only has TIX (reserved list cards)
                const onlyHasTix = priceKeys.length === 1 && priceKeys[0] === 'tix';
                if (card?.prints_search_uri && (!priceKeys.length || onlyHasTix)) {
                  console.log('[DeckPriceMini]   Attempting to fetch cheapest printing from', card.prints_search_uri, '(only TIX or no prices available)');
                  try {
                    const printsRes = await fetch(card.prints_search_uri, { cache: 'no-store' });
                    const printsData = await printsRes.json().catch(() => ({}));
                    const printCards = Array.isArray(printsData?.data) ? printsData.data : [];
                    console.log('[DeckPriceMini]   Found', printCards.length, 'printings');
                    
                    // Find cheapest non-foil price across all printings
                    let cheapest: number | null = null;
                    for (const print of printCards) {
                      const printPrices = print?.prices || {};
                      const priceKey = currency === 'EUR' ? 'eur' : currency === 'GBP' ? 'gbp' : 'usd';
                      
                      // Try primary price first
                      let pv = printPrices?.[priceKey];
                      
                      // Fallback to foil if needed (for USD)
                      if ((!pv || pv === null || pv === 0) && currency === 'USD') {
                        pv = printPrices?.usd_foil || printPrices?.usd_etched || printPrices?.usd;
                      }
                      
                      if (pv != null && pv > 0 && !isNaN(Number(pv))) {
                        const priceNum = Number(pv);
                        cheapest = cheapest === null ? priceNum : Math.min(cheapest, priceNum);
                      }
                    }
                    
                    if (cheapest !== null && cheapest > 0) {
                      prices[cardName] = cheapest;
                      foundCount++;
                      console.log('[DeckPriceMini]   ✓ Found cheapest printing price:', cheapest, currency, 'from', printCards.length, 'printings');
                    } else {
                      console.log('[DeckPriceMini]   ✗ No prices found in any printing');
                    }
                  } catch (printError) {
                    console.warn('[DeckPriceMini]   Failed to fetch prints:', printError);
                  }
                }
              }
            }
            console.log('[DeckPriceMini] Batch result: found', foundCount, 'prices');
          }
        } catch (scryfallError) {
          console.warn('[DeckPriceMini] Scryfall fallback failed:', scryfallError);
          // Continue with whatever prices we have from snapshot
        }
      }
      
      console.log('[DeckPriceMini] Final prices:', Object.keys(prices).length, 'total');
      console.log('[DeckPriceMini] Sample prices:', Object.entries(prices).slice(0, 5));
      
      const sum = items.reduce((acc,it)=> {
        const normalizedName = norm(it.name);
        const price = prices[normalizedName] || 0;
        if (price === 0) {
          console.log('[DeckPriceMini] Card', it.name, 'normalized:', normalizedName, 'has no price');
        }
        return acc + (price * Math.max(0, Number(it.qty||0)));
      }, 0);
      console.log('[DeckPriceMini] Calculated total:', sum);
      setTotal(sum);
    } catch(e:any){ setError(e?.message||'failed'); }
    finally{ setBusy(false); }
  }

  React.useEffect(()=>{ refresh(); }, [deckId]);
  React.useEffect(()=>{ if(total!=null) refresh(); }, [currency]);

  return (
    <div className="text-sm">
      <div className="flex items-center justify-end mb-3">
        <select value={currency} onChange={e=> setCurrency(e.currentTarget.value as any)} className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs">
          <option>USD</option>
          <option>EUR</option>
          <option>GBP</option>
        </select>
      </div>
      {error && (<div className="text-xs text-red-400 mb-2">{error}</div>)}
      {!error && (
        <>
          <div className="text-2xl font-mono font-semibold mb-2">
            {total==null? (busy? '…' : '—') : new Intl.NumberFormat(undefined, { style:'currency', currency }).format(total)}
          </div>
          <div className="text-[11px] opacity-60">Uses snapshot prices per card in the selected currency.</div>
        </>
      )}
    </div>
  );
}
