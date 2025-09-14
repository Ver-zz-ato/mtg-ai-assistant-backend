// components/deckEvents.ts
const target = typeof window !== 'undefined' ? new EventTarget() : null;

export function emitDeckChanged(detail: { deckId: string }) {
  if (!target) return;
  target.dispatchEvent(new CustomEvent('deck:changed', { detail }));
}

export function onDeckChanged(handler: (e: CustomEvent<{ deckId: string }>) => void) {
  if (!target) return () => {};
  const h = handler as EventListener;
  target.addEventListener('deck:changed', h);
  return () => target.removeEventListener('deck:changed', h);
}
export default { emitDeckChanged, onDeckChanged };
