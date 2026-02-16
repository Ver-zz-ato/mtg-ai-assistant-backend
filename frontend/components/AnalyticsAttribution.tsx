'use client';

import { useEffect } from 'react';

const STORAGE_KEY_RECORDED = 'mt_attribution_recorded';
const STORAGE_KEY_ANON = 'mt_anon_id';

function getOrCreateAnonIdFallback(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = localStorage.getItem(STORAGE_KEY_ANON);
    if (!id) {
      id = crypto.randomUUID?.() ?? `f${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(STORAGE_KEY_ANON, id);
    }
    return id;
  } catch {
    return '';
  }
}

function extractReferrerDomain(referrer: string): string | null {
  if (!referrer || typeof referrer !== 'string') return null;
  try {
    const url = new URL(referrer);
    return url.hostname || null;
  } catch {
    return null;
  }
}

function getUtmParams(search: string): Record<string, string | null> {
  const params = new URLSearchParams(search);
  return {
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    utm_campaign: params.get('utm_campaign'),
    utm_content: params.get('utm_content'),
    utm_term: params.get('utm_term'),
  };
}

export default function AnalyticsAttribution() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(STORAGE_KEY_RECORDED)) return;

    const pathname = window.location.pathname || '/';
    const referrerDomain = extractReferrerDomain(document.referrer || '');
    const utms = getUtmParams(window.location.search);
    const anonIdFallback = getOrCreateAnonIdFallback();

    const body = {
      initial_pathname: pathname,
      referrer_domain: referrerDomain,
      utm_source: utms.utm_source,
      utm_medium: utms.utm_medium,
      utm_campaign: utms.utm_campaign,
      utm_content: utms.utm_content,
      utm_term: utms.utm_term,
      anon_id_fallback: anonIdFallback || undefined,
    };

    fetch('/api/analytics/attribution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    })
      .then((res) => {
        if (res.ok) {
          try {
            localStorage.setItem(STORAGE_KEY_RECORDED, 'true');
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  return null;
}
