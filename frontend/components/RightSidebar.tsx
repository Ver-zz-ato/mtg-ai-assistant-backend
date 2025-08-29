import Shoutbox from "./Shoutbox";

export default function RightSidebar() {
  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="font-semibold mb-2">Deck Snapshot/Judger</div>
        <div className="text-sm text-gray-300">
          Paste a deck to get score, curve, color identity & quick fixes.
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="font-semibold mb-2">Price Checker</div>
        <div className="flex gap-2">
          <select className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
            <option>USD</option><option>EUR</option><option>GBP</option>
          </select>
          <button className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm hover:bg-gray-700">
            Sources…
          </button>
        </div>
      </div>

      <Shoutbox />

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 h-48 grid place-content-center text-gray-400">
        <div className="text-xs uppercase tracking-wide mb-2">Ad Placeholder</div>
        <div className="text-sm">300 × 250</div>
      </div>
    </div>
  );
}
