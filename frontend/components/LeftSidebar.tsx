// frontend/components/LeftSidebar.tsx
export default function LeftSidebar() {
  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="font-semibold mb-2">Recent Decks</div>
        <ul className="space-y-2 text-sm text-gray-300">
          <li className="hover:text-white cursor-pointer">Yuriko, the Tiger&apos;s Shadow</li>
          <li className="hover:text-white cursor-pointer">Atraxa Superfriends</li>
          <li className="hover:text-white cursor-pointer">Korvold Food Chain</li>
        </ul>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 h-48 grid place-content-center text-gray-400">
        <div className="text-xs uppercase tracking-wide mb-2">Ad Placeholder</div>
        <div className="text-sm">300 × 250</div>
      </div>
    </div>
  );
}
