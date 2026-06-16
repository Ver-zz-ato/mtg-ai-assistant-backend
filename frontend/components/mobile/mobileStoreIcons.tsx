export function GooglePlayIcon({ className = "h-4 w-4 shrink-0" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <path fill="#34A853" d="M4.4 2.4c-.3.2-.4.6-.4 1.1v17c0 .5.2.9.5 1.1l9-9.6-9.1-9.6Z" />
      <path fill="#FBBC04" d="m16.5 9.1-3-1.7L4.7 2.3l8.8 9.7 3-2.9Z" />
      <path fill="#4285F4" d="m4.7 21.7 8.8-9.7-3-2.9-6 12.6h.2Z" />
      <path fill="#EA4335" d="M20 10.3 16.5 9l-3 3 3 3 3.5-1.9c1.3-.8 1.3-2.1 0-2.8Z" />
    </svg>
  );
}

type StoreBadgeProps = {
  className?: string;
};

const badgeBase =
  "inline-flex min-h-[44px] w-full min-w-[154px] items-center justify-center rounded-[10px] border border-white/20 bg-black px-3 py-2 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]";

export function GooglePlayBadge({ className = "" }: StoreBadgeProps) {
  return (
    <span className={`${badgeBase} gap-2 ${className}`}>
      <GooglePlayIcon className="h-7 w-7 shrink-0" />
      <span className="flex flex-col items-start leading-none">
        <span className="text-[9px] font-semibold uppercase tracking-[0.08em]">Get it on</span>
        <span className="mt-0.5 text-[19px] font-semibold tracking-[-0.03em]">Google Play</span>
      </span>
    </span>
  );
}

export function AppStoreBadge({ className = "" }: StoreBadgeProps) {
  return (
    <span className={`${badgeBase} gap-2 ${className}`}>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7 shrink-0 fill-white">
        <path d="M16.68 12.7c-.02-2.03 1.66-3.01 1.74-3.06-.95-1.38-2.42-1.57-2.93-1.59-1.24-.13-2.44.74-3.07.74-.64 0-1.61-.72-2.65-.7-1.36.02-2.63.79-3.33 2.01-1.42 2.46-.36 6.08 1 8.07.68.97 1.47 2.05 2.51 2.01 1.02-.04 1.4-.65 2.64-.65 1.23 0 1.58.65 2.66.63 1.1-.02 1.8-.97 2.45-1.95.78-1.11 1.09-2.21 1.1-2.27-.02-.01-2.09-.8-2.12-3.24ZM14.68 6.74c.55-.69.93-1.62.82-2.56-.8.04-1.8.55-2.37 1.22-.51.6-.97 1.57-.84 2.49.9.07 1.82-.46 2.39-1.15Z" />
      </svg>
      <span className="flex flex-col items-start leading-none">
        <span className="text-[9px] font-semibold tracking-[0.06em]">Download on the</span>
        <span className="mt-0.5 text-[19px] font-semibold tracking-[-0.03em]">App Store</span>
      </span>
    </span>
  );
}
