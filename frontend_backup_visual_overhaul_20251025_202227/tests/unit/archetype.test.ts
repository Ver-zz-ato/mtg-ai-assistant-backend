// tests/unit/archetype.test.ts
import { scoreCard, addScores, emptyScores } from "../../lib/archetype";

function approx(a: number, b: number, eps = 1e-9) { return Math.abs(a - b) < eps; }
function assert(cond: any, msg: string) { if (!cond) throw new Error(msg); }

async function main() {
  // Creature 1-drop adds aggro and a bit of midrange
  let s = scoreCard('Creature — Human', '', 1, 1);
  assert(approx(s.aggro, 0.7), `aggro expected 0.7 got ${s.aggro}`);
  assert(approx(s.midrange, 0.2), `midrange expected 0.2 got ${s.midrange}`);

  // Instant with counter text contributes to control
  s = scoreCard('Instant', 'Counter target spell', 2, 1);
  assert(s.control > 0.7, 'control should be > 0.7 for counterspell');

  // Tutor contributes to combo
  s = scoreCard('Sorcery', 'Search your library for a card', 3, 1);
  assert(s.combo >= 0.7, 'combo should be high for tutor');

  // Stax keyword
  s = scoreCard('Enchantment', "Players can't cast more than one spell each turn.", 3, 1);
  assert(s.stax >= 0.8, 'stax should be high for Rule of Law effect');

  // Quantity is capped at 4
  s = scoreCard('Creature', '', 1, 10);
  assert(s.aggro <= 4, 'qty should be capped');

  // Aggregation
  const agg = addScores(emptyScores(), s);
  assert(agg.aggro >= s.aggro, 'aggregation should add');
  console.log('OK archetype tests');
}

main().catch((e) => { console.error(e); process.exit(1); });
