"use client";
import { usePrefs } from "./PrefsContext";

export default function Header() {
  const { mode, setMode } = usePrefs();

  const btn = (active: boolean) =>
    `px-4 py-2 rounded-lg border ${active ? "bg-yellow-500 text-gray-900 border-yellow-400" : "bg-gray-800 text-gray-200 border-gray-700 hover:bg-gray-700"}`;

  return (
    <header className="bg-gray-900/90 backdrop-blur sticky top-0 z-40 border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2 mr-auto">
          <div className="h-7 w-7 rounded-md bg-yellow-400/90 text-gray-900 grid place-content-center font-black">M</div>
          <div className="text-lg font-semibold tracking-tight">MTG Coach</div>
        </div>

        <div className="hidden md:flex items-center gap-2">
          <button className={btn(mode === "deck")} onClick={() => setMode("deck")}>Deck Builder</button>
          <button className={btn(mode === "rules")} onClick={() => setMode("rules")}>Rule Checker</button>
          <button className={btn(mode === "price")} onClick={() => setMode("price")}>Price Checker</button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700">Signup</button>
          <button className="px-3 py-2 rounded-lg bg-yellow-500 text-gray-900 font-medium hover:bg-yellow-400">Login</button>
        </div>
      </div>
    </header>
  );
}
