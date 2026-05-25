'use client';

import { useState } from 'react';
import { Copy, ExternalLink, QrCode, Send, Share2 } from 'lucide-react';
import { capture } from '@/lib/ph';
import { track } from '@/lib/analytics/track';
import { useAuth } from '@/lib/auth-context';
import { useProStatus } from '@/hooks/useProStatus';
import QRShareModal from '@/components/share/QRShareModal';

interface ShareButtonProps {
  url: string;
  title?: string;
  description?: string;
  className?: string;
  type?: 'deck' | 'profile' | 'collection' | 'wishlist' | 'roast' | 'health report' | 'analysis' | 'custom card' | 'card';
  isPublic?: boolean;
  onMakePublic?: () => void;
  compact?: boolean;
}

export default function ShareButton({ 
  url, 
  title = 'Check this out!', 
  description = '',
  className = '',
  type = 'deck',
  isPublic = true,
  onMakePublic,
  compact = false
}: ShareButtonProps) {
  const [showOptions, setShowOptions] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [copiedRecently, setCopiedRecently] = useState(false);
  const { user } = useAuth();
  const { isPro } = useProStatus();

  const handleCopy = async () => {
    try {
      if (!isPublic && onMakePublic) {
        const makePublic = confirm(`This ${type} is private. Make it public to generate a shareable link?`);
        if (makePublic) {
          onMakePublic();
          return;
        }
        return;
      }

      await navigator.clipboard.writeText(url);
      setCopiedRecently(true);
      
      // Track the share
      try {
        capture('content_shared', {
          content_type: type,
          share_method: 'copy_link',
          content_url: url
        });
      } catch {}
      
      // Track UI click
      try {
        const deckId = url.match(/\/decks\/([^\/]+)/)?.[1] || null;
        track('ui_click', {
          area: 'deck',
          action: 'share',
          deckId: deckId,
        }, {
          userId: user?.id || null,
          isPro: isPro,
        });
      } catch {}

      // Show success feedback
      try {
        const { toast } = await import('@/lib/toast-client');
        toast('Link copied to clipboard!', 'success');
      } catch {}

      setTimeout(() => setCopiedRecently(false), 2000);
      setShowOptions(false);
    } catch (error) {
      console.error('Failed to copy:', error);
      try {
        const { toastError } = await import('@/lib/toast-client');
        toastError('Failed to copy link');
      } catch {
        alert('Could not copy link');
      }
    }
  };

  const handleNativeShare = async () => {
    try {
      if ('share' in navigator) {
        await (navigator as any).share({
          title,
          text: description,
          url
        });

        // Track native share
        try {
          capture('content_shared', {
            content_type: type,
            share_method: 'native_share',
            content_url: url
          });
        } catch {}
      }
    } catch (error) {
      // User cancelled or share failed, fall back to copy
      handleCopy();
    }
    setShowOptions(false);
  };

  const handleShowQr = () => {
    try {
      capture('content_shared', {
        content_type: type,
        share_method: 'qr',
        content_url: url
      });
    } catch {}
    setShowQr(true);
    setShowOptions(false);
  };

  const handleExternalShare = (platform: string) => {
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);
    const encodedDesc = encodeURIComponent(description);

    const platforms = {
      twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
      reddit: `https://reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
      discord: '', // Discord doesn't have a direct share URL, will copy instead
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    };

    // Track external share attempt
    try {
      capture('content_shared', {
        content_type: type,
        share_method: platform,
        content_url: url
      });
    } catch {}

    if (platform === 'discord') {
      // For Discord, copy a formatted message
      const discordMessage = `${title}\n${url}${description ? '\n' + description : ''}`;
      navigator.clipboard.writeText(discordMessage).then(() => {
        try {
          import('@/lib/toast-client').then(({ toast }) => {
            toast('Discord message copied! Paste it in your server.', 'success');
          });
        } catch {}
      });
    } else {
      window.open(platforms[platform as keyof typeof platforms], '_blank', 'width=600,height=400');
    }
    setShowOptions(false);
  };

  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1 ${copiedRecently ? 'text-green-400' : ''} ${className}`}
        >
          {copiedRecently ? (
            <>
              <Copy className="h-3 w-3" aria-hidden="true" />
              Copied!
            </>
          ) : (
            <>
              <Share2 className="h-3 w-3" aria-hidden="true" />
              Share
            </>
          )}
        </button>
        <QRShareModal
          open={showQr}
          url={url}
          title={`Share ${type}`}
          description={title}
          onClose={() => setShowQr(false)}
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowOptions(!showOptions)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium transition-colors ${className}`}
      >
        {copiedRecently ? (
          <>
            <Copy className="h-4 w-4 text-green-600" aria-hidden="true" />
            Copied!
          </>
        ) : (
          <>
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Share {type}
          </>
        )}
      </button>

      {showOptions && (
        <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-48">
          <div className="p-2">
            <div className="text-xs text-gray-600 mb-2 px-2">Share this {type}:</div>
            
            <button
              onClick={handleCopy}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copy link
            </button>

            <button
              onClick={handleShowQr}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
            >
              <QrCode className="h-4 w-4" aria-hidden="true" />
              Show QR
            </button>

            {'share' in navigator && (
              <button
                onClick={handleNativeShare}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                Share via device
              </button>
            )}

            <hr className="my-2" />
            
            <button
              onClick={() => handleExternalShare('discord')}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
            >
              <div className="w-4 h-4 bg-indigo-600 rounded"></div>
              Copy for Discord
            </button>

            <button
              onClick={() => handleExternalShare('reddit')}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
            >
              <div className="w-4 h-4 bg-orange-600 rounded"></div>
              Post to Reddit
            </button>

            <button
              onClick={() => handleExternalShare('twitter')}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Share on Twitter
            </button>
          </div>
        </div>
      )}

      {showOptions && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowOptions(false)}
        />
      )}
      <QRShareModal
        open={showQr}
        url={url}
        title={`Share ${type}`}
        description={title}
        onClose={() => setShowQr(false)}
      />
    </div>
  );
}
