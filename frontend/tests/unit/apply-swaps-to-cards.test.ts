import { applySwapsToCards } from '@/lib/decks/applySwapsToCards';

const cards = [
  { name: 'Sol Ring', qty: 1, zone: 'mainboard' },
  { name: 'Command Tower', qty: 1, zone: 'mainboard' },
];

console.assert(applySwapsToCards(cards, [{ from: 'Sol Ring', to: 'Arcane Signet' }]).some((c) => c.name === 'Arcane Signet'));
console.assert(!applySwapsToCards(cards, [{ from: 'Sol Ring', to: 'Arcane Signet' }]).some((c) => c.name === 'Sol Ring'));
console.log('apply-swaps-to-cards: ok');
