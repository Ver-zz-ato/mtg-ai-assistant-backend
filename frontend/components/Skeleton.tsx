"use client";
import React from "react";

export default function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-neutral-900 ${className}`} />;
}