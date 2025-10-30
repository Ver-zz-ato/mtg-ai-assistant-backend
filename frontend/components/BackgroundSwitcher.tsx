"use client";

/**
 * 🧪 LOCAL TESTING ONLY - Background Switcher
 * This component is ONLY for local testing and will NOT work in production.
 * DO NOT COMMIT THIS TO GITHUB - This is for development testing only!
 */

import { useState, useEffect } from "react";

// 🧪 CONFIGURE YOUR 3 BACKGROUND IMAGES HERE
// Put your images in frontend/public/backgroundchoices/ and name them:
const BACKGROUNDS = [
  "/backgroundchoices/bg1.png", // Replace with your actual image names
  "/backgroundchoices/bg2.png",
  "/backgroundchoices/bg3.png",
];

export default function BackgroundSwitcher() {
  // Only show in development
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  const [currentBg, setCurrentBg] = useState(0);

  useEffect(() => {
    // Load saved preference from localStorage
    const saved = localStorage.getItem("test_background_index");
    if (saved !== null) {
      const index = parseInt(saved, 10);
      if (index >= 0 && index < BACKGROUNDS.length) {
        setCurrentBg(index);
      }
    }
  }, []);

  const switchBackground = (index: number) => {
    setCurrentBg(index);
    localStorage.setItem("test_background_index", index.toString());
    // Update the background image
    const bgDiv = document.querySelector('[data-test-background]') as HTMLElement;
    if (bgDiv) {
      bgDiv.style.backgroundImage = `url(${BACKGROUNDS[index]})`;
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      <div className="bg-black/80 backdrop-blur-sm border border-yellow-500/50 rounded-lg p-2 shadow-lg">
        <div className="text-xs text-yellow-400 mb-1 px-1 font-semibold">
          🧪 LOCAL TEST ONLY
        </div>
        <div className="flex gap-1">
          {BACKGROUNDS.map((bg, index) => (
            <button
              key={index}
              onClick={() => switchBackground(index)}
              className={`px-2 py-1 text-xs rounded transition-all ${
                currentBg === index
                  ? "bg-yellow-500 text-black font-bold"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {index + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

