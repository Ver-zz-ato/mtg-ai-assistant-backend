export default function DeckHealthCard() {
  return (
    <div className="rounded-xl p-4 border border-yellow-500/60 bg-gray-900">
      <div className="flex items-center gap-2 text-yellow-400 font-semibold mb-2">
        <span>Deck Health: 72/100</span>
        <span className="text-gray-400 font-normal">– needs a touch more draw</span>
      </div>
      <div className="text-sm text-gray-300 mb-3">Bands: Curve 0.78 · Ramp 0.70 · Draw 0.55 · Removal 0 · Mana 0.72</div>
      <div className="grid md:grid-cols-2 gap-3 text-sm">
        <div>
          <div className="font-medium">What’s good</div>
          <ul className="list-disc ml-5 space-y-1 text-gray-300">
            <li>Ninjutsu core is intact.</li>
            <li>Strong 1–2 mana interaction density.</li>
          </ul>
        </div>
        <div>
          <div className="font-medium">Quick fixes</div>
          <ol className="list-decimal ml-5 space-y-1 text-gray-300">
            <li>Add <em>Beast Whisperer</em> or <em>Inspiring Call</em>.</li>
            <li>Fill the two-drop gap: <em>Faerie Seer</em>, <em>Changeling Outcast</em>.</li>
          </ol>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 text-sm">Add Inspiring Call</button>
        <button className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 text-sm">Add Beast Whisperer</button>
      </div>
    </div>
  );
}
