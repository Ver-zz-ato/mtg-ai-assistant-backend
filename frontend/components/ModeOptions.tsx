"use client";
import { usePrefs } from "./PrefsContext";
import { track } from "@/lib/analytics/track";
import { useAuth } from "@/lib/auth-context";
import { useProStatus } from "@/hooks/useProStatus";
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
  const { user } = useAuth();
  const { isPro } = useProStatus();

  
  // Safe fallbacks for optional context fields
  const colorsList = colors ?? ([] as Color[]);
  const safeSetFormat = setFormat ?? ((_: string) => {});
  const safeSetPlan = setPlan ?? ((_: string) => {});
  const safeToggleColor = toggleColor ?? ((_: string) => {});
  const safeClearColors = clearColors ?? (() => {});
  const safeSetCurrency = setCurrency ?? ((_: string) => {});
const pill = (active: boolean) =>
    `px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border text-xs sm:text-sm ${
      active ? "bg-gray-700 border-gray-600" : "bg-gray-800 border-gray-700 hover:bg-gray-700"
    }`;

  const onCurrencyChange = (e: React.ChangeEvent<HTMLSelectElement>) => { safeSetCurrency(e.currentTarget.value as Currency); };

  return (
    <div className="border-b border-gray-800 bg-gray-900">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 sm:py-3 flex flex-wrap gap-1 sm:gap-2 md:gap-3 items-center text-sm sm:text-base">
        {mode === "deck" && (
          <>
            <span className="text-gray-400 mr-1 text-xs sm:text-sm">Format</span>
            {(["Commander", "Standard", "Modern", "Pioneer", "Pauper"] as const).map((f) => (
              <button key={f} className={pill(format === f)} onClick={() => {
                safeSetFormat(f);
                track('ui_click', {
                  area: 'chat',
                  action: 'persona_select',
                  persona: 'format',
                  value: f.toLowerCase(),
                }, {
                  userId: user?.id || null,
                  isPro: isPro,
                });
              }}>{f}</button>
            ))}
            <span className="mx-1 sm:mx-2 text-gray-600 hidden sm:inline">|</span>
            <span className="text-gray-400 mr-1 text-xs sm:text-sm">Plan</span>
            {(["Budget", "Optimized"] as const).map((p) => (
              <button key={p} className={pill(plan === p)} onClick={() => {
                safeSetPlan(p);
                track('ui_click', {
                  area: 'chat',
                  action: 'persona_select',
                  persona: 'plan',
                  value: p.toLowerCase(),
                }, {
                  userId: user?.id || null,
                  isPro: isPro,
                });
              }}>{p}</button>
            ))}
            <span className="mx-1 sm:mx-2 text-gray-600 hidden sm:inline">|</span>
            <span className="text-gray-400 mr-1 text-xs sm:text-sm">Colors</span>
            {(["W","U","B","R","G"] as const).map((c) => (
              <button
                key={c}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border text-xs sm:text-sm ${
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
              className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border text-xs sm:text-sm bg-gray-800 border-gray-700 hover:bg-gray-700"
              onClick={safeClearColors}
            >
              Clear
            </button>
          </>
        )}

        {mode === "rules" && (
          <>
            <span className="text-gray-400 mr-1 text-xs sm:text-sm">Format</span>
            {(["Commander", "Standard", "Modern", "Pioneer", "Pauper"] as const).map((f) => (
              <button key={f} className={pill(format === f)} onClick={() => {
                safeSetFormat(f);
                track('ui_click', {
                  area: 'chat',
                  action: 'persona_select',
                  persona: 'format',
                  value: f.toLowerCase(),
                }, {
                  userId: user?.id || null,
                  isPro: isPro,
                });
              }}>{f}</button>
            ))}
          </>
        )}

        {(mode === "deck" || mode === "price") && (
          <>
            <span className="mx-1 sm:mx-2 text-gray-600 hidden sm:inline">|</span>
            <span className="text-gray-400 mr-1 text-xs sm:text-sm">Currency</span>
            <select
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm"
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
