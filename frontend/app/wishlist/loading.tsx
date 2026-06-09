export default function WishlistLoading() {
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="h-10 w-40 bg-neutral-800 rounded animate-pulse mb-6" />
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 bg-neutral-900 border border-neutral-800 rounded-lg animate-pulse" />
        ))}
      </div>
    </main>
  );
}
