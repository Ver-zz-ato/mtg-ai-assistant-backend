"use client";
import React from "react";

export default function PriceChip({ amount, currency }: { amount: number; currency: 'USD'|'EUR'|'GBP' }){
  return <span className="tabular-nums">{new Intl.NumberFormat(undefined,{ style:'currency', currency }).format(amount)}</span>;
}
