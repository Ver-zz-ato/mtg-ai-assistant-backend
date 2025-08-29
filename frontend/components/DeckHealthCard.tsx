// components/DeckHealthCard.tsx
type Bands = { curve: number; ramp: number; draw: number; removal: number; mana: number };

export default function DeckHealthCard({
  score = 72,
  note = "needs a touch more draw",
  bands = { curve: 0.78, ramp: 0.70, draw: 0.55, removal: 0.0, mana: 0.72 },
  whatsGood = ["Ninjutsu core is intact.", "Strong 1–2 mana interaction density."],
  quickFixes = ["Add 2 draw spells: <em>Beast Whisperer</em>, <em>Inspiring Call</em>."],
}: {
  score?: number;
  note?: string;
  bands?: Bands;
  whatsGood?: string[];
  quickFixes?: string[];
}) {
  return (
    <div className="rounded-xl p-4 border border-yellow-500/60 bg-gray-900">
      <div className="flex items-center gap-2 text-yellow-400 font-semibold mb-2">
        <span>Deck Health: {score}/100</span>
        <span className="text-gray-400 font-normal">– {note}</span>
      </div>

      <div className="text-sm text-gray-300 mb-3">
        Bands: Curve {bands.curve.toFixed(2)} · Ramp {bands.ramp.toFixed(2)} · Draw {bands.draw.toFixed(2)} · Removal {bands.removal.toFixed(2)} · Mana {bands.mana.toFixed(2)}
      </div>

      <div className="grid md:grid-cols-2 gap-3 text-sm">
        <div>
          <div className="font-medium">What’s good</div>
          <ul className="list-disc ml-5 space-y-1 text-gray-300">
            {whatsGood.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        </div>
        <div>
          <div className="font-medium">Quick fixes</div>
          <ol className="list-decimal ml-5 space-y-1 text-gray-300">
            {quickFixes.map((q, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: q }} />
            ))}
          </ol>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 text-sm">
          Copy steps
        </button>
        <button className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 text-sm">
          Export (soon)
        </button>
      </div>
    </div>
  );
}
