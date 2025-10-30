/**
 * Global Background Component
 * Applies the background image to all pages
 */

export default function GlobalBackground() {
  return (
    <div 
      className="fixed inset-0 -z-10"
      style={{
        backgroundImage: 'url(/backgroundchoices/bg1.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        minHeight: '100vh',
        // Force high-quality rendering
        imageRendering: 'crisp-edges' as any,
        WebkitBackfaceVisibility: 'hidden' as any,
        backfaceVisibility: 'hidden' as any,
        transform: 'translateZ(0)' as any,
        willChange: 'transform',
      }}
    />
  );
}

