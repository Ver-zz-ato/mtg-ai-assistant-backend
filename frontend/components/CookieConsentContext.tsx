"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { getConsentStatus } from "@/lib/consent";

export type ConsentModalMode = "banner" | "preferences";

interface CookieConsentContextType {
  isOpen: boolean;
  mode: ConsentModalMode;
  openModal: () => void;
  openPreferences: () => void;
  closeModal: () => void;
  setMode: (mode: ConsentModalMode) => void;
}

const CookieConsentContext = createContext<CookieConsentContextType | null>(null);

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<ConsentModalMode>("banner");

  const openModal = useCallback(() => {
    setMode("banner");
    setIsOpen(true);
  }, []);

  const openPreferences = useCallback(() => {
    setMode("preferences");
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setMode("banner");
  }, []);

  // Check on mount if consent is unknown
  React.useEffect(() => {
    if (window.location.pathname === "/get") {
      return;
    }

    const status = getConsentStatus();
    if (status === "unknown") {
      setMode("banner");
      setIsOpen(true);
    }
  }, []);

  return (
    <CookieConsentContext.Provider
      value={{ isOpen, mode, openModal, openPreferences, closeModal, setMode }}
    >
      {children}
    </CookieConsentContext.Provider>
  );
}

export function useCookieConsentModal() {
  const context = useContext(CookieConsentContext);
  if (!context) {
    throw new Error("useCookieConsentModal must be used within CookieConsentProvider");
  }
  return context;
}
