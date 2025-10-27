export type PriceMode = 'live' | 'snapshot';

function today(): string {
  try {
    return new Date().toISOString().slice(0, 10);
  } catch {
    return '1970-01-01';
  }
}

export function readPricePrefs(): { mode: PriceMode; snapshotDate: string } {
  try {
    const modeRaw = (localStorage.getItem('price:mode') || '').toLowerCase();
    let mode: PriceMode = modeRaw === 'snapshot' ? 'snapshot' : 'live';
    // Back-compat keys
    const legacyCtf = localStorage.getItem('ctf:useSnapshot');
    const legacySwaps = localStorage.getItem('swaps:useSnapshot');
    if (mode === 'live' && (legacyCtf === '1' || legacySwaps === '1')) mode = 'snapshot';

    const storedDate = localStorage.getItem('price:snapshotDate');
    const snapshotDate = (storedDate && /\d{4}-\d{2}-\d{2}/.test(storedDate)) ? storedDate : today();
    return { mode, snapshotDate };
  } catch {
    return { mode: 'live', snapshotDate: today() };
  }
}

export function writePricePrefs(mode: PriceMode, snapshotDate?: string): void {
  try {
    const date = (snapshotDate && /\d{4}-\d{2}-\d{2}/.test(snapshotDate)) ? snapshotDate : today();
    localStorage.setItem('price:mode', mode);
    localStorage.setItem('price:snapshotDate', date);
    // Keep legacy toggles in sync for now
    localStorage.setItem('ctf:useSnapshot', mode === 'snapshot' ? '1' : '0');
    localStorage.setItem('swaps:useSnapshot', mode === 'snapshot' ? '1' : '0');
  } catch {/* ignore */}
}

export function yesterday(ymd: string): string {
  try {
    const d = new Date(ymd);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  } catch {
    return today();
  }
}