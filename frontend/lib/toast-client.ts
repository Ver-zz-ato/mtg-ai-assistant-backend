"use client";
// Minimal client-side toast trigger so helpers can show errors without importing React

let showError: ((msg: string) => void) | null = null;
let showToast: ((msg: string, type?: "success"|"error"|"warning"|"info") => void) | null = null;

export function registerToastApi(api: {
  showError: (msg: string) => void;
  showToast: (msg: string, type?: "success"|"error"|"warning"|"info") => void;
}) {
  showError = api.showError;
  showToast = api.showToast;
}

export function toastError(message: string) {
  try { showError?.(message); } catch {}
}

export function toast(message: string, type: "success"|"error"|"warning"|"info" = "info") {
  try { showToast?.(message, type); } catch {}
}
