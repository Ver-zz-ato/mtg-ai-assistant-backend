"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { getConsentStatus } from "@/lib/consent";

interface CookieConsentContextType {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const CookieConsentContext = createContext<CookieConsentContextType | null>(null);

export function CookieConsentProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Check on mount if consent is unknown
  React.useEffect(() => {
    const status = getConsentStatus();
    if (status === "unknown") {
      setIsOpen(true);
    }
  }, []);

  return (
    <CookieConsentContext.Provider value={{ isOpen, openModal, closeModal }}>
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

