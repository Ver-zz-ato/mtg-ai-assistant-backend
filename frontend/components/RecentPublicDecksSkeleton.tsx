// components/RecentPublicDecksSkeleton.tsx
export default function RecentPublicDecksSkeleton() {
  const items = new Array(6).fill(0);
  return (
    <div className="rounded-xl border border-gray-800 p-4">
      <div className="text-sm font-semibold mb-2">Recent Public Decks</div>
      <ul className="space-y-2">
        {items.map((_, i) => (
          <li key={i} className="border rounded-md p-3">
            <div className="h-4 w-40 bg-gray-800/70 rounded mb-2" />
            <div className="h-3 w-24 bg-gray-800/50 rounded" />
          </li>
        ))}
      </ul>
    </div>
  );
}
