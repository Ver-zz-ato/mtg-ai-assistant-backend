"use client";
import { usePrefs } from "./PrefsContext";
type Color = "W" | "U" | "B" | "R" | "G";
type Currency = "USD" | "EUR" | "GBP";
const colorLabel: Record<Color, string> = { W: "W", U: "U", B: "B", R: "R", G: "G" };

export default function ModeOptions() {
  const {
    mode,
    format, setFormat,
    plan, setPlan,
    colors, toggleColor, clearColors,
    currency, setCurrency,
  } = usePrefs();

  
  // Safe fallbacks for optional context fields
  const colorsList = colors ?? ([] as Color[]);
  const safeSetFormat = setFormat ?? ((_: string) => {});
  const safeSetPlan = setPlan ?? ((_: string) => {});
  const safeToggleColor = toggleColor ?? ((_: string) => {});
  const safeClearColors = clearColors ?? (() => {});
  const safeSetCurrency = setCurrency ?? ((_: string) => {});
const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-lg border text-sm ${
      active ? "bg-gray-700 border-gray-600" : "bg-gray-800 border-gray-700 hover:bg-gray-700"
    }`;

  const onCurrencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => { safeSetCurrency(e.currentTarget.value as Currency); };

  return (
    <div className="border-b border-gray-800 bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap gap-3 items-center">
        {mode === "deck" && (
          <>
            <span className="text-gray-400 mr-1">Format</span>
            {(["Commander", "Modern", "Pioneer"] as const).map((f) => (
              <button key={f} className={pill(format === f)} onClick={() => safeSetFormat(f)}>{f}</button>
            ))}
            <span className="mx-2 text-gray-600">|</span>
            <span className="text-gray-400 mr-1">Plan</span>
            {(["Budget", "Optimized"] as const).map((p) => (
              <button key={p} className={pill(plan === p)} onClick={() => safeSetPlan(p)}>{p}</button>
            ))}
            <span className="mx-2 text-gray-600">|</span>
            <span className="text-gray-400 mr-1">Colors</span>
            {(["W","U","B","R","G"] as const).map((c) => (
              <button
                key={c}
                className={`px-3 py-1.5 rounded-lg border text-sm ${
                  colorsList.includes(c)
                    ? "bg-yellow-500/20 border-yellow-400 text-yellow-300"
                    : "bg-gray-800 border-gray-700 hover:bg-gray-700"
                }`}
                onClick={() => safeToggleColor(c)}
                title={colorLabel[c]}
              >
                {colorLabel[c]}
              </button>
            ))}
            <button
              className="px-3 py-1.5 rounded-lg border text-sm bg-gray-800 border-gray-700 hover:bg-gray-700"
              onClick={safeClearColors}
            >
              Clear
            </button>
          </>
        )}

        {mode === "rules" && (
          <>
            <span className="text-gray-400 mr-1">Format</span>
            {(["Commander", "Modern", "Pioneer"] as const).map((f) => (
              <button key={f} className={pill(format === f)} onClick={() => safeSetFormat(f)}>{f}</button>
            ))}
          </>
        )}

        {(mode === "deck" || mode === "price") && (
          <>
            <span className="mx-2 text-gray-600">|</span>
            <span className="text-gray-400 mr-1">Currency</span>
            <select
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm"
              value={currency ?? "USD"}
              onChange={onCurrencyChange}
            >
              <option>USD</option>
              <option>EUR</option>
              <option>GBP</option>
            </select>
          </>
        )}

      </div>
    </div>
  );
}
