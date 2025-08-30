type Bands = { curve: number; ramp: number; draw: number; removal: number; mana: number };

export default function DeckHealthCard({
  score = 72,
  note = "needs a touch more draw",
  bands = { curve: 0.78, ramp: 0.7, draw: 0.55, removal: 0.0, mana: 0.72 },
  whatsGood = ["Ninjutsu core is intact.", "Strong 1–2 mana interaction density."],
  quickFixes = ["Add 2 draw spells: <em>Beast Whisperer</em>, <em>Inspiring Call</em>."],
  illegalByCI = 0,
  illegalExamples = [],
}: {
  score?: number;
  note?: string;
  bands?: Bands;
  whatsGood?: string[];
  quickFixes?: string[];
  illegalByCI?: number;
  illegalExamples?: string[];
}) {
  const Bar = ({ v }: { v: number }) => (
    <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
      <div
        className="h-full bg-yellow-500"
        style={{ width: `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%` }}
      />
    </div>
  );

  return (
    <div className="rounded-xl p-4 border border-yellow-500/60 bg-gray-900">
      <div className="flex items-center gap-2 text-yellow-400 font-semibold mb-2">
        <span>Deck Health: {score}/100</span>
        <span className="text-gray-400 font-normal">– {note}</span>
      </div>

      {/* Bands */}
      <div className="grid grid-cols-5 gap-3 text-xs text-gray-300 mb-3">
        <div><div className="mb-1">Curve</div><Bar v={bands.curve} /></div>
        <div><div className="mb-1">Ramp</div><Bar v={bands.ramp} /></div>
        <div><div className="mb-1">Draw</div><Bar v={bands.draw} /></div>
        <div><div className="mb-1">Removal</div><Bar v={bands.removal} /></div>
        <div><div className="mb-1">Mana</div><Bar v={bands.mana} /></div>
      </div>

      {/* EDH CI illegal line */}
      {illegalByCI > 0 && (
        <div className="text-sm text-red-400 mb-3">
          Illegal by color identity: <b>{illegalByCI}</b>
          {illegalExamples.length > 0 && (
            <> — e.g., {illegalExamples.slice(0, 3).join(", ")}</>
          )}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3 text-sm">
        <div>
          <div className="font-medium text-gray-200 mb-1">What’s good</div>
          <ul className="list-disc ml-5 space-y-1 text-gray-300">
            {whatsGood.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
        <div>
          <div className="font-medium text-gray-200 mb-1">Quick fixes</div>
          <ul className="list-disc ml-5 space-y-1 text-gray-300">
            {quickFixes.map((s, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: s }} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
