"use client";
// Minimal client-side toast trigger so helpers can show errors without importing React

let showError: ((msg: string) => void) | null = null;
let showToast: ((msg: string, type?: "success"|"error"|"warning"|"info") => void) | null = null;
let showPanel: ((opts: { title?: string; lines?: Array<{ id?: string; text: string; onClick?: () => void; disabled?: boolean }>; actions?: { id?: string; label: string; onClick?: () => void; variant?: "primary"|"danger"|"default" }[]; anchor?: { x: number; y: number }; large?: boolean; type?: "success"|"error"|"warning"|"info"; autoCloseMs?: number | null; }) => { id: string }) | null = null;
let removeToast: ((id: string) => void) | null = null;

export function registerToastApi(api: {
  showError: (msg: string) => void;
  showToast: (msg: string, type?: "success"|"error"|"warning"|"info") => void;
  showPanel?: (opts: { title?: string; lines?: Array<{ id?: string; text: string; onClick?: () => void; disabled?: boolean }>; actions?: { id?: string; label: string; onClick?: () => void; variant?: "primary"|"danger"|"default" }[]; anchor?: { x: number; y: number }; large?: boolean; type?: "success"|"error"|"warning"|"info"; autoCloseMs?: number | null; }) => { id: string };
  removeToast?: (id: string) => void;
}) {
  showError = api.showError;
  showToast = api.showToast;
  showPanel = api.showPanel || null;
  removeToast = api.removeToast || null;
}

export function toastError(message: string) {
  try { showError?.(message); } catch {}
}

export function toast(message: string, type: "success"|"error"|"warning"|"info" = "info") {
  try { showToast?.(message, type); } catch {}
}

export function toastPanel(opts: { title?: string; lines?: Array<{ id?: string; text: string; onClick?: () => void; disabled?: boolean }>; actions?: { id?: string; label: string; onClick?: () => void; variant?: "primary"|"danger"|"default" }[]; anchor?: { x: number; y: number }; large?: boolean; type?: "success"|"error"|"warning"|"info"; autoCloseMs?: number | null; }): { id: string } | null {
  try { return showPanel ? showPanel(opts) : null; } catch { return null; }
}

export function dismissToast(id: string) {
  try { removeToast?.(id); } catch {}
}
