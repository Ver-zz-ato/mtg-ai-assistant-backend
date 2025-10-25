"use client";
import React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { getManaGlow } from "@/lib/mana-colors";

export default function TopToolsStrip() {
  const [flags, setFlags] = React.useState<any>(null);
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
  
  React.useEffect(()=>{ (async()=>{ try{ const r=await fetch('/api/config?key=flags',{cache:'no-store'}); const j=await r.json(); if(j?.config?.flags) setFlags(j.config.flags);} catch{} })(); },[]);
  const riskyOn = flags ? (flags.risky_betas !== false) : true;

  const tools = [
    { href: "/collections/cost-to-finish", img: "/Cost To Finish.png", alt: "Cost to Finish", desc: "Know what's left to buy • Prices updated daily", tour: "cost-to-finish" },
    { href: "/deck/swap-suggestions", img: "/Budget Swaps.png", alt: "Budget Swaps", desc: "Trade power for pennies • Keep your strategy", tour: "budget-swaps" },
    ...(riskyOn ? [{ href: "/price-tracker", img: "/Price Tracker.png", alt: "Price Tracker", desc: "Stay ahead of spikes • Never overpay", tour: "price-tracker" }] : []),
    { href: "/tools/mulligan", img: "/Mulligan Simulator.png", alt: "Mulligan Simulator", desc: "Test your opening hands • Build better", tour: "mulligan" },
    { href: "/tools/probability", img: "/Probability Helpers.png", alt: "Probability Helpers", desc: "Odds of drawing X by turn Y • Math made simple", tour: "probability" },
  ];

  return (
    <div className="w-full">
      <div className="w-full grid grid-cols-1 md:grid-cols-5 gap-3 mb-0 overflow-x-auto md:overflow-visible">
        {tools.map((tool, idx) => (
          <motion.a
            key={idx}
            href={tool.href}
            className="block rounded-xl overflow-hidden relative group"
            data-tour={tool.tour}
            onMouseEnter={() => setHoveredIndex(idx)}
            onMouseLeave={() => setHoveredIndex(null)}
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
            style={{
              boxShadow: hoveredIndex === idx ? `0 0 20px ${idx === 0 ? 'rgba(0, 225, 140, 0.3)' : 'rgba(147, 51, 234, 0.3)'}` : 'none'
            }}
          >
            {/* Image */}
            <div className="relative">
              <Image src={tool.img} alt={tool.alt} width={400} height={200} className="w-full h-auto" priority />
              
              {/* Flip overlay with description */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-br from-purple-900/95 to-blue-900/95 flex items-center justify-center p-4 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: hoveredIndex === idx ? 1 : 0 }}
                transition={{ duration: 0.3 }}
                style={{ pointerEvents: hoveredIndex === idx ? 'auto' : 'none' }}
              >
                <p className="text-white text-sm font-medium">
                  {tool.desc}
                </p>
              </motion.div>
            </div>
          </motion.a>
        ))}
      </div>
    </div>
  );
}
