export function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  const limit = Math.min(k, n - k);
  for (let i = 1; i <= limit; i++) {
    result = (result * (n - limit + i)) / i;
  }
  return result;
}

export function hypergeomPMF(k: number, K: number, N: number, n: number): number {
  const numerator = comb(K, k) * comb(N - K, n - k);
  const denominator = comb(N, n);
  return denominator === 0 ? 0 : numerator / denominator;
}

export function hypergeomCDFAtLeast(k: number, K: number, N: number, n: number): number {
  let probability = 0;
  const upper = Math.min(n, K);
  for (let i = k; i <= upper; i++) {
    probability += hypergeomPMF(i, K, N, n);
  }
  return Math.max(0, Math.min(1, probability));
}

type NarrativeParams = {
  deckSize: number;
  successes: number;
  draws: number;
  atLeast: number;
  openingHand?: number;
  turns?: number;
};

export function buildProbabilityNarrative({
  deckSize,
  successes,
  draws,
  atLeast,
  openingHand,
  turns,
}: NarrativeParams): { lines: string[]; probability: number } {
  const sanitizedDraws = Math.max(0, Math.floor(draws));
  const sanitizedSuccesses = Math.max(0, Math.min(deckSize, successes));
  const sanitizedAtLeast = Math.max(0, Math.min(sanitizedSuccesses, atLeast));

  const probability = hypergeomCDFAtLeast(
    sanitizedAtLeast,
    sanitizedSuccesses,
    deckSize,
    sanitizedDraws
  );

  const lines: string[] = [];

  if (openingHand !== undefined && turns !== undefined) {
    const opener = Math.max(0, Math.floor(openingHand));
    const extra = Math.max(0, sanitizedDraws - opener);
    lines.push(
      `You see ${sanitizedDraws} cards in total — ${opener} from the opening hand and ${extra} more by turn ${turns}.`
    );
  } else {
    lines.push(`You see ${sanitizedDraws} cards in total.`);
  }

  lines.push(
    `There are ${sanitizedSuccesses} hits in your ${deckSize}-card deck.`
  );

  if (sanitizedAtLeast <= 1) {
    const failNumerator = comb(deckSize - sanitizedSuccesses, sanitizedDraws);
    const denominator = comb(deckSize, sanitizedDraws);
    const missChance =
      denominator === 0 ? 0 : Math.max(0, Math.min(1, failNumerator / denominator));

    lines.push(
      `Miss chance = C(${deckSize - sanitizedSuccesses}, ${sanitizedDraws}) ÷ C(${deckSize}, ${sanitizedDraws}) ≈ ${(missChance * 100).toFixed(2)}%.`
    );
    if (probability > 0) {
      lines.push(
        `Hit chance = 1 − miss ≈ ${(probability * 100).toFixed(2)}%, or roughly once every ${(1 / probability).toFixed(1)} games.`
      );
    } else {
      lines.push(`Hit chance is effectively 0% with the current inputs.`);
    }
  } else {
    const upper = Math.min(sanitizedDraws, sanitizedSuccesses);
    lines.push(
      `We sum the hypergeometric probabilities from ${sanitizedAtLeast} to ${upper} hits: Σ C(${sanitizedSuccesses}, i) · C(${deckSize - sanitizedSuccesses}, ${sanitizedDraws} − i) ÷ C(${deckSize}, ${sanitizedDraws}).`
    );
    lines.push(`That evaluates to ${(probability * 100).toFixed(2)}%.`);
  }

  if (deckSize >= 90) {
    lines.push(
      `Commander context: that percentage is a good rule of thumb for a singleton deck aiming to find this effect.`
    );
  } else if (deckSize <= 65) {
    lines.push(
      `60-card context: formats like Modern or Pioneer will feel this hit rate in a similar way.`
    );
  }

  return { lines, probability };
}

