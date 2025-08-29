type Props = { mode: "deck" | "rules" | "price" };

export default function ModeOptions({ mode }: Props) {
  if (mode === "deck") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-400">Deck Builder</span>
        <button className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700">Commander</button>
        <button className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700">Modern</button>
        <button className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700">Pioneer</button>
        <span className="mx-2 text-gray-600">|</span>
        <button className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700">Budget</button>
        <button className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700">Optimized</button>
        <span className="mx-2 text-gray-600">|</span>
        <button className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700">Colors</button>
      </div>
    );
  }
  if (mode === "rules") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-400">Rule Checker</span>
        <button className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700">EDH</button>
        <button className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700">Modern</button>
        <button className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700">Legacy</button>
        <span className="mx-2 text-gray-600">|</span>
        <button className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700">Commander name</button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-gray-400">Price Checker</span>
      <select className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5">
        <option>USD</option><option>EUR</option><option>GBP</option>
      </select>
      <button className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700">Sources: Scryfall, TCG, CM</button>
    </div>
  );
}
