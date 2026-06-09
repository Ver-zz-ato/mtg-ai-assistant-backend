export default function CollectionsLoading() {
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="h-10 w-48 bg-neutral-800 rounded animate-pulse mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 bg-neutral-900 border border-neutral-800 rounded-xl animate-pulse" />
        ))}
      </div>
    </main>
  );
}
