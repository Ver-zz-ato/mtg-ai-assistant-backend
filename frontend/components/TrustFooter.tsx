'use client';

import { useState, useEffect } from 'react';

interface TrustInfo {
  modelVersion: string;
  dataSource: string;
  lastUpdate: string;
}

interface ChangelogData {
  last_updated?: string;
  entries?: any[];
}

interface TrustFooterProps {
  className?: string;
  compact?: boolean;
}

type MonetizeConfig = { stripe: boolean; kofi: boolean; paypal: boolean };

export default function TrustFooter({ className = '', compact = false }: TrustFooterProps) {
  const [trustInfo, setTrustInfo] = useState<TrustInfo | null>({
    modelVersion: 'GPT-5 & GPT-4o Mini',
    dataSource: 'Scryfall API', 
    lastUpdate: 'Oct 12, 2025'
  });
  const [isVisible, setIsVisible] = useState(false);
  const [monetizeConfig, setMonetizeConfig] = useState<MonetizeConfig>({ 
    stripe: true, 
    kofi: true, 
    paypal: true 
  });

  useEffect(() => {
    // Load changelog data and monetization config
    const loadData = async () => {
      try {
        // Fetch monetization config
        const configRes = await fetch('/api/config', { cache: 'no-store' });
        const configData = await configRes.json().catch(() => ({}));
        
        if (configData?.ok && configData?.monetize) {
          setMonetizeConfig({
            stripe: !!configData.monetize.stripe,
            kofi: !!configData.monetize.kofi,
            paypal: !!configData.monetize.paypal,
          });
        }
        
        // Fetch the actual bulk price import job timestamp (this is the real card data update time)
        let lastUpdate = 'Recent';
        try {
          const jobRes = await fetch('/api/admin/config?key=job:last:bulk_price_import', { cache: 'no-store' });
          const jobData = await jobRes.json().catch(() => ({}));
          if (jobData?.config?.['job:last:bulk_price_import']) {
            const timestamp = jobData.config['job:last:bulk_price_import'];
            // Format timestamp to "Oct 19, 2025"
            const date = new Date(timestamp);
            if (!isNaN(date.getTime())) {
              lastUpdate = date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric', 
                year: 'numeric' 
              });
            } else {
              lastUpdate = timestamp; // Fallback: use raw value if parsing fails
            }
          }
        } catch (e) {
          console.warn('Failed to load bulk import timestamp:', e);
        }
        
        setTrustInfo({
          modelVersion: 'GPT-5 & GPT-4o Mini',
          dataSource: 'Scryfall API',
          lastUpdate
        });
      } catch (error) {
        // Fallback values
        console.warn('Failed to load footer data:', error);
        setTrustInfo({
          modelVersion: 'GPT-5 & GPT-4o Mini',
          dataSource: 'Scryfall API',
          lastUpdate: 'Recent'
        });
      }
    };
    
    loadData();
  }, []);

  if (!trustInfo) return null;

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  if (compact) {
    return (
      <div className={`text-xs text-gray-500 ${className}`}>
        <button
          onClick={() => setIsVisible(!isVisible)}
          className="hover:text-gray-700 underline decoration-dotted"
        >
          Trust Info
        </button>
        {isVisible && (
          <div className="mt-2 p-3 bg-gray-50 rounded-lg border text-xs">
            <div className="space-y-1">
              <div>
                <span className="font-medium">AI Model:</span> {trustInfo.modelVersion}
              </div>
              <div>
                <span className="font-medium">Card Data:</span> {trustInfo.dataSource}
              </div>
              <div className="text-gray-400">
                Updated {formatDate(trustInfo.lastUpdate)}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <footer className={`border-t border-gray-800 py-6 text-sm text-gray-400 ${className}`}>
      <div className="max-w-full mx-auto px-4">
        {/* Trust Information */}
        <div className="mb-4 pb-4 border-b border-gray-700">
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="font-medium">AI Model:</span>
                <span className="text-gray-300">{trustInfo.modelVersion}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="font-medium">Card Data:</span>
                <a 
                  href="https://scryfall.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  {trustInfo.dataSource}
                </a>
                <span className="text-gray-500 text-xs ml-2">
                  (Updated {formatDate(trustInfo.lastUpdate)})
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="text-center mb-4">
          <div>© {new Date().getFullYear()} ManaTap AI</div>
        </div>
        
        {/* Explore ManaTap - Enhanced Internal Navigation */}
        <div className="mb-6">
          <div className="text-center mb-3">
            <h3 className="text-lg font-semibold text-gray-300">Explore ManaTap</h3>
          </div>
          <nav className="flex gap-3 items-center flex-wrap justify-center text-sm">
            <a className="px-3 py-1.5 rounded-md bg-gradient-to-r from-purple-600/20 to-purple-500/10 border border-purple-500/30 hover:from-purple-500/30 hover:to-purple-400/20 hover:border-purple-400/40 transition-all" href="/changelog">What's New</a>
            <a className="px-3 py-1.5 rounded-md bg-gradient-to-r from-emerald-600/20 to-emerald-500/10 border border-emerald-500/30 hover:from-emerald-500/30 hover:to-emerald-400/20 hover:border-emerald-400/40 transition-all" href="/collections/cost-to-finish">Cost to Finish</a>
            <a className="px-3 py-1.5 rounded-md bg-gradient-to-r from-cyan-600/20 to-cyan-500/10 border border-cyan-500/30 hover:from-cyan-500/30 hover:to-cyan-400/20 hover:border-cyan-400/40 transition-all" href="/budget-swaps">Budget Swaps</a>
            <a className="px-3 py-1.5 rounded-md bg-gradient-to-r from-blue-600/20 to-blue-500/10 border border-blue-500/30 hover:from-blue-500/30 hover:to-blue-400/20 hover:border-blue-400/40 transition-all" href="/price-tracker">Price Tracker</a>
            <a className="px-3 py-1.5 rounded-md bg-gradient-to-r from-amber-600/20 to-amber-500/10 border border-amber-500/30 hover:from-amber-500/30 hover:to-amber-400/20 hover:border-amber-400/40 transition-all" href="/tools/probability">Probability</a>
            <a className="px-3 py-1.5 rounded-md bg-gradient-to-r from-orange-600/20 to-orange-500/10 border border-orange-500/30 hover:from-orange-500/30 hover:to-orange-400/20 hover:border-orange-400/40 transition-all" href="/tools/mulligan">Mulligan</a>
            <a className="px-3 py-1.5 rounded-md bg-gradient-to-r from-pink-600/20 to-pink-500/10 border border-pink-500/30 hover:from-pink-500/30 hover:to-pink-400/20 hover:border-pink-400/40 transition-all" href="/my-decks">My Decks</a>
            <a className="px-3 py-1.5 rounded-md bg-gradient-to-r from-rose-600/20 to-rose-500/10 border border-rose-500/30 hover:from-rose-500/30 hover:to-rose-400/20 hover:border-rose-400/40 transition-all" href="/collections">My Collections</a>
            <a className="px-3 py-1.5 rounded-md bg-gradient-to-r from-violet-600/20 to-violet-500/10 border border-violet-500/30 hover:from-violet-500/30 hover:to-violet-400/20 hover:border-violet-400/40 transition-all" href="/wishlist">My Wishlist</a>
            <a className="px-3 py-1.5 rounded-md bg-gradient-to-r from-indigo-600/20 to-indigo-500/10 border border-indigo-500/30 hover:from-indigo-500/30 hover:to-indigo-400/20 hover:border-indigo-400/40 transition-all" href="/profile">Profile</a>
          </nav>
        </div>
        
        {/* Support & Payment Links */}
        <div className="flex justify-center mb-6">
          <nav className="flex gap-6 items-center flex-wrap justify-center text-base">
            <a className="hover:text-gray-200 transition-colors" href="/support">Support</a>
            <a className="hover:text-gray-200 transition-colors" href="/pricing">Pricing</a>
            {monetizeConfig.stripe && (
              <a className="hover:text-gray-200 transition-colors" href="https://buy.stripe.com/14A4gAdle89v3XE61q4AU01" target="_blank" rel="noreferrer">Stripe</a>
            )}
            {monetizeConfig.kofi && (
              <a className="hover:text-gray-200 transition-colors" href="https://ko-fi.com/davydraws7/tip" target="_blank" rel="noreferrer">Ko‑fi</a>
            )}
            {monetizeConfig.paypal && (
              <a className="hover:text-gray-200 transition-colors" href="https://paypal.me/DavyDraws7" target="_blank" rel="noreferrer">PayPal</a>
            )}
            <a className="hover:text-gray-200 transition-colors" href="/terms">Terms</a>
            <a className="hover:text-gray-200 transition-colors" href="/privacy">Privacy</a>
            <a className="hover:text-gray-200 transition-colors" href="/refund">Refund Policy</a>
          </nav>
        </div>

        {/* Legal disclaimer */}
        <div className="pt-4 border-t border-gray-700 text-xs text-gray-500 leading-relaxed text-center">
          <p className="mb-2">
            This assistant uses AI to help with Magic: The Gathering deck building and strategy. 
            Card information is sourced from Scryfall's comprehensive database. 
            AI responses should be verified for competitive play.
          </p>
          <p className="mb-2">
            Wizards of the Coast, Magic: The Gathering, and their logos are trademarks of Wizards of the Coast LLC 
            in the United States and other countries. © 1993-{new Date().getFullYear()} Wizards. All Rights Reserved. 
            Manatap.ai is not affiliated with, endorsed, sponsored, or specifically approved by Wizards of the Coast LLC.
            Manatap.ai may use the trademarks and other intellectual property of Wizards of the Coast LLC, which is permitted under Wizards' Fan Site Policy. 
            MAGIC: THE GATHERING® is a trademark of Wizards of the Coast.
          </p>
          <p>
            Some card prices and other card data are provided by{' '}
            <a className="underline hover:text-gray-200" href="https://scryfall.com/" target="_blank" rel="noreferrer">Scryfall</a>.
            {' '}Scryfall makes no guarantee about its price information and recommends you see stores for final prices and details.
            {' '}For more information about Wizards of the Coast, visit{' '}
            <a className="underline hover:text-gray-200" href="https://company.wizards.com/" target="_blank" rel="noreferrer">https://company.wizards.com/</a>.
          </p>
        </div>
      </div>
    </footer>
  );
}