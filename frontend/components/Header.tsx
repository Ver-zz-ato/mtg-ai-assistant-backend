"use client";
import { useState } from "react";
import ModeOptions from "./ModeOptions";

export default function Header() {
  const [active, setActive] = useState<null | "deck" | "rules" | "price">(null);

  return (
    <header className="bg-gray-900/90 backdrop-blur sticky top-0 z-40 border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2 mr-auto">
          <div className="h-7 w-7 rounded-md bg-yellow-400/90 text-gray-900 grid place-content-center font-black">M</div>
          <div className="text-lg font-semibold tracking-tight">MTG Coach</div>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <button onClick={() => setActive(active === "deck" ? null : "deck")} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700">Deck Builder</button>
          <button onClick={() => setActive(active === "rules" ? null : "rules")} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700">Rule Checker</button>
          <button onClick={() => setActive(active === "price" ? null : "price")} className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700">Price Checker</button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700">Signup</button>
          <button className="px-3 py-2 rounded-lg bg-yellow-500 text-gray-900 font-medium hover:bg-yellow-400">Login</button>
        </div>
      </div>

      {active && (
        <div className="border-t border-gray-800 bg-gray-900">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <ModeOptions mode={active} />
          </div>
        </div>
      )}
    </header>
  );
}
