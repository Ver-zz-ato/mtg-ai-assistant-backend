export type DiffEntry = { name: string; before: number; after: number; delta: number };

export function computeDiff(
  before: Array<{ name: string; qty: number }>,
  after: Array<{ name: string; qty: number }>
): DiffEntry[] {
  const mapFrom = new Map(before.map(it=>[it.name.toLowerCase(), it.qty]));
  const mapTo = new Map(after.map(it=>[it.name.toLowerCase(), it.qty]));
  const names = Array.from(new Set([...mapFrom.keys(), ...mapTo.keys()]));
  return names.map(nm => {
    const a = mapFrom.get(nm) || 0;
    const b = mapTo.get(nm) || 0;
    return { name: nm, before: a, after: b, delta: b - a };
  }).filter(e => e.delta !== 0);
}
