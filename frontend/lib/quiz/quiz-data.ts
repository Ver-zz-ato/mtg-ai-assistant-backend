// frontend/lib/quiz/quiz-data.ts
// Quiz questions and trait mapping logic

export interface QuizAnswer {
  id: string;
  text: string;
  traits: {
    winStyle?: 'calculated' | 'explosive' | 'inevitable' | 'funny';
    gameLength?: 'long' | 'controlled' | 'short' | 'story';
    consistency?: 'high' | 'variance' | 'multiple-plans' | 'one-shot';
    annoyance?: 'misplay' | 'length' | 'uninteractive' | 'samey';
    budget?: 'spend' | 'budget-punch' | 'proxy' | 'own';
    favoriteMoment?: 'outplay' | 'combo' | 'survive' | 'laugh';
  };
}

export interface QuizQuestion {
  id: string;
  text: string;
  answers: QuizAnswer[];
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'win-style',
    text: "Your ideal win feels like…",
    answers: [
      { id: 'calculated', text: 'A clean, calculated checkmate', traits: { winStyle: 'calculated' } },
      { id: 'explosive', text: 'A sudden explosion nobody saw coming', traits: { winStyle: 'explosive' } },
      { id: 'inevitable', text: 'Slow inevitability — they knew it was over', traits: { winStyle: 'inevitable' } },
      { id: 'funny', text: "I don't care if I win, as long as it was funny", traits: { winStyle: 'funny' } },
    ],
  },
  {
    id: 'game-length',
    text: 'How do you feel about long games?',
    answers: [
      { id: 'love-long', text: 'Love them — more decisions, more depth', traits: { gameLength: 'long' } },
      { id: 'controlled', text: 'Fine, if I\'m in control', traits: { gameLength: 'controlled' } },
      { id: 'shuffle-up', text: 'I\'d rather shuffle up again', traits: { gameLength: 'short' } },
      { id: 'stories', text: 'Length doesn\'t matter, stories do', traits: { gameLength: 'story' } },
    ],
  },
  {
    id: 'consistency',
    text: 'Pick what you agree with most:',
    answers: [
      { id: 'consistency', text: 'Consistency is king', traits: { consistency: 'high' } },
      { id: 'variance', text: 'Variance keeps things exciting', traits: { consistency: 'variance' } },
      { id: 'plans', text: 'I like having a plan B… and C', traits: { consistency: 'multiple-plans' } },
      { id: 'once', text: 'If it works once, it\'s worth it', traits: { consistency: 'one-shot' } },
    ],
  },
  {
    id: 'annoyance',
    text: 'What annoys you most at a table?',
    answers: [
      { id: 'misplay', text: 'People misplaying', traits: { annoyance: 'misplay' } },
      { id: 'forever', text: 'Games taking forever', traits: { annoyance: 'length' } },
      { id: 'uninteractive', text: 'Uninteractive combos', traits: { annoyance: 'uninteractive' } },
      { id: 'samey', text: 'Everyone playing the same decks', traits: { annoyance: 'samey' } },
    ],
  },
  {
    id: 'budget',
    text: 'Budget reality check:',
    answers: [
      { id: 'spend', text: 'I\'ll spend if it improves the deck', traits: { budget: 'spend' } },
      { id: 'budget', text: 'I enjoy making budget decks punch up', traits: { budget: 'budget-punch' } },
      { id: 'proxy', text: 'Proxy-friendly mindset', traits: { budget: 'proxy' } },
      { id: 'own', text: 'I build with what I own', traits: { budget: 'own' } },
    ],
  },
  {
    id: 'favorite-moment',
    text: 'Your favourite MTG moment is usually…',
    answers: [
      { id: 'outplay', text: 'Outplaying someone', traits: { favoriteMoment: 'outplay' } },
      { id: 'combo', text: 'Pulling off the combo', traits: { favoriteMoment: 'combo' } },
      { id: 'survive', text: 'Surviving when I shouldn\'t', traits: { favoriteMoment: 'survive' } },
      { id: 'laugh', text: 'The table laughing at something dumb', traits: { favoriteMoment: 'laugh' } },
    ],
  },
];

export interface PlaystyleProfile {
  label: string;
  gameLength: 'Short' | 'Medium' | 'Long';
  chaosTolerance: 'Low' | 'Med' | 'High';
  winVsStory: 'Win-focused' | 'Mixed' | 'Story';
  interactionPreference: 'High' | 'Med' | 'Low';
  description: string;
}

export function calculateProfile(answers: Record<string, string>): PlaystyleProfile {
  // Collect all traits from answers
  const traits: {
    winStyle?: string;
    gameLength?: string;
    consistency?: string;
    annoyance?: string;
    budget?: string;
    favoriteMoment?: string;
  } = {};

  for (const questionId in answers) {
    const question = QUIZ_QUESTIONS.find(q => q.id === questionId);
    const answer = question?.answers.find(a => a.id === answers[questionId]);
    if (answer?.traits) {
      Object.assign(traits, answer.traits);
    }
  }

  // Determine profile based on trait combinations
  let label = 'Value Engine';
  let gameLength: 'Short' | 'Medium' | 'Long' = 'Medium';
  let chaosTolerance: 'Low' | 'Med' | 'High' = 'Med';
  let winVsStory: 'Win-focused' | 'Mixed' | 'Story' = 'Mixed';
  let interactionPreference: 'High' | 'Med' | 'Low' = 'Med';
  let description = 'You enjoy balanced gameplay with multiple paths to victory.';

  // Win style analysis
  if (traits.winStyle === 'calculated' && traits.consistency === 'high') {
    label = 'Calculated Control';
    gameLength = 'Long';
    chaosTolerance = 'Low';
    winVsStory = 'Win-focused';
    interactionPreference = 'High';
    description = 'You prefer methodical, interactive games where every decision matters.';
  } else if (traits.winStyle === 'explosive' && traits.consistency === 'variance') {
    label = 'Chaos Gremlin';
    gameLength = 'Short';
    chaosTolerance = 'High';
    winVsStory = 'Story';
    interactionPreference = 'Low';
    description = 'You thrive on unpredictability and explosive turns that create memorable moments.';
  } else if (traits.winStyle === 'inevitable' && traits.gameLength === 'long') {
    label = 'Value Engine';
    gameLength = 'Long';
    chaosTolerance = 'Low';
    winVsStory = 'Win-focused';
    interactionPreference = 'Med';
    description = 'You build incremental advantage and win through superior resource management.';
  } else if (traits.winStyle === 'funny' || traits.favoriteMoment === 'laugh') {
    label = 'Table Politician';
    gameLength = 'Medium';
    chaosTolerance = 'High';
    winVsStory = 'Story';
    interactionPreference = 'High';
    description = 'You prioritize fun interactions and memorable plays over pure victory.';
  } else if (traits.favoriteMoment === 'combo' && traits.consistency === 'high') {
    label = 'Combo Master';
    gameLength = 'Short';
    chaosTolerance = 'Low';
    winVsStory = 'Win-focused';
    interactionPreference = 'Low';
    description = 'You enjoy assembling intricate combos and winning in spectacular fashion.';
  } else if (traits.favoriteMoment === 'outplay' && traits.annoyance === 'uninteractive') {
    label = 'Tactical Mind';
    gameLength = 'Medium';
    chaosTolerance = 'Med';
    winVsStory = 'Win-focused';
    interactionPreference = 'High';
    description = 'You excel at reading opponents and making optimal plays in complex situations.';
  }

  // Override game length based on direct answer
  if (traits.gameLength === 'long') gameLength = 'Long';
  else if (traits.gameLength === 'short') gameLength = 'Short';
  else if (traits.gameLength === 'story') {
    gameLength = 'Medium';
    winVsStory = 'Story';
  }

  // Chaos tolerance from consistency
  if (traits.consistency === 'variance' || traits.consistency === 'one-shot') {
    chaosTolerance = 'High';
  } else if (traits.consistency === 'high') {
    chaosTolerance = 'Low';
  }

  // Interaction from annoyance
  if (traits.annoyance === 'uninteractive') {
    interactionPreference = 'High';
  } else if (traits.annoyance === 'length') {
    interactionPreference = 'Low';
  }

  return {
    label,
    gameLength,
    chaosTolerance,
    winVsStory,
    interactionPreference,
    description,
  };
}

// ============================================
// NUMERIC TRAITS SYSTEM (0-100 scale)
// ============================================

/**
 * Numeric traits for granular playstyle analysis.
 * All values are 0-100 where 50 is neutral.
 */
export interface PlaystyleTraits {
  control: number;            // 0=aggro, 100=full control
  aggression: number;         // 0=passive, 100=aggressive
  comboAppetite: number;      // 0=no combos, 100=combo-focused
  varianceTolerance: number;  // 0=consistency, 100=high variance
  interactionPref: number;    // 0=solitaire, 100=highly interactive
  gameLengthPref: number;     // 0=short games, 100=long games
  budgetElasticity: number;   // 0=strict budget, 100=no budget concerns
}

/**
 * Trait delta mappings for each answer.
 * Deltas are applied to a base of 50 for each trait.
 */
const TRAIT_DELTAS: Record<string, Partial<PlaystyleTraits>> = {
  // Win style question
  'calculated': { control: 25, aggression: -15, comboAppetite: 10, varianceTolerance: -20, interactionPref: 15 },
  'explosive': { control: -20, aggression: 25, comboAppetite: 15, varianceTolerance: 20, interactionPref: -10 },
  'inevitable': { control: 20, aggression: -10, comboAppetite: -5, varianceTolerance: -15, gameLengthPref: 20 },
  'funny': { control: -10, aggression: 0, comboAppetite: 0, varianceTolerance: 25, interactionPref: 20 },
  
  // Game length question
  'love-long': { control: 15, gameLengthPref: 30, varianceTolerance: -10 },
  'controlled': { control: 20, gameLengthPref: 10, interactionPref: 10 },
  'shuffle-up': { aggression: 15, gameLengthPref: -25, varianceTolerance: 10 },
  'stories': { varianceTolerance: 15, interactionPref: 15, gameLengthPref: 5 },
  
  // Consistency question
  'consistency': { varianceTolerance: -25, control: 15, comboAppetite: 10 },
  'variance': { varianceTolerance: 25, control: -10, aggression: 10 },
  'plans': { varianceTolerance: 0, control: 10, comboAppetite: 5 },
  'once': { varianceTolerance: 20, comboAppetite: 20, aggression: 15 },
  
  // Annoyance question
  'misplay': { control: 10, interactionPref: 10 },
  'forever': { gameLengthPref: -20, aggression: 10 },
  'uninteractive': { interactionPref: 25, comboAppetite: -15 },
  'samey': { varianceTolerance: 15, control: -5 },
  
  // Budget question
  'spend': { budgetElasticity: 30 },
  'budget': { budgetElasticity: -15, control: 5 },
  'proxy': { budgetElasticity: 20, comboAppetite: 5 },
  'own': { budgetElasticity: -25 },
  
  // Favorite moment question
  'outplay': { control: 15, interactionPref: 20, aggression: 5 },
  'combo': { comboAppetite: 25, control: 5, interactionPref: -10 },
  'survive': { control: 20, gameLengthPref: 10, varianceTolerance: 10 },
  'laugh': { varianceTolerance: 20, interactionPref: 15, comboAppetite: -10 },
};

/**
 * Compute numeric traits from quiz answers.
 * Returns 0-100 values for each trait dimension.
 */
export function computeTraits(answers: Record<string, string>): PlaystyleTraits {
  // Start with neutral values
  const traits: PlaystyleTraits = {
    control: 50,
    aggression: 50,
    comboAppetite: 50,
    varianceTolerance: 50,
    interactionPref: 50,
    gameLengthPref: 50,
    budgetElasticity: 50,
  };

  // Apply deltas from each answer
  for (const questionId in answers) {
    const answerId = answers[questionId];
    const deltas = TRAIT_DELTAS[answerId];
    if (deltas) {
      for (const key in deltas) {
        const traitKey = key as keyof PlaystyleTraits;
        traits[traitKey] += deltas[traitKey] || 0;
      }
    }
  }

  // Clamp all values to 0-100
  for (const key in traits) {
    const traitKey = key as keyof PlaystyleTraits;
    traits[traitKey] = Math.max(0, Math.min(100, traits[traitKey]));
  }

  return traits;
}

/**
 * Avoid list item with explanation.
 */
export interface AvoidItem {
  label: string;
  why: string;
}

/**
 * Compute playstyle "avoid list" - things the player likely dislikes.
 * Based on trait analysis.
 */
export function computeAvoidList(traits: PlaystyleTraits): AvoidItem[] {
  const avoidList: AvoidItem[] = [];

  // High control + low variance = avoid chaos decks
  if (traits.control > 65 && traits.varianceTolerance < 40) {
    avoidList.push({
      label: 'Chaos/Random Effects',
      why: 'You prefer predictable outcomes over coin flips and random effects.',
    });
  }

  // Low interaction preference = avoid stax/heavy interaction
  if (traits.interactionPref < 35) {
    avoidList.push({
      label: 'Heavy Stax/Control',
      why: 'You prefer developing your own board over policing others.',
    });
  }

  // High interaction + low combo = avoid solitaire combos
  if (traits.interactionPref > 65 && traits.comboAppetite < 40) {
    avoidList.push({
      label: 'Solitaire Combos',
      why: 'You want games where players interact, not watch one person combo off.',
    });
  }

  // Low game length preference = avoid grindy strategies
  if (traits.gameLengthPref < 35) {
    avoidList.push({
      label: 'Grindy/Slow Decks',
      why: 'You prefer games that reach a conclusion rather than grinding for hours.',
    });
  }

  // High game length + high control = avoid fast aggro
  if (traits.gameLengthPref > 65 && traits.control > 60) {
    avoidList.push({
      label: 'All-in Aggro',
      why: 'You prefer building to a late game rather than racing to kill early.',
    });
  }

  // Low variance + high combo = avoid inconsistent combo
  if (traits.varianceTolerance < 35 && traits.comboAppetite > 60) {
    avoidList.push({
      label: 'Glass Cannon Builds',
      why: 'You want reliable combo lines, not high-risk all-in strategies.',
    });
  }

  // Low budget elasticity = avoid expensive staples
  if (traits.budgetElasticity < 30) {
    avoidList.push({
      label: 'Budget-Breaking Staples',
      why: 'You prefer creative solutions over expensive auto-includes.',
    });
  }

  // High aggression + low control = avoid pillow fort
  if (traits.aggression > 65 && traits.control < 40) {
    avoidList.push({
      label: 'Pillow Fort/Turbo Fog',
      why: 'You want to attack and deal damage, not hide behind walls.',
    });
  }

  // Return top 3 most relevant
  return avoidList.slice(0, 3);
}

/**
 * Get trait label for display (e.g., "Control: 75%")
 */
export function getTraitLabel(key: keyof PlaystyleTraits): string {
  const labels: Record<keyof PlaystyleTraits, string> = {
    control: 'Control',
    aggression: 'Aggression',
    comboAppetite: 'Combo Appetite',
    varianceTolerance: 'Variance Tolerance',
    interactionPref: 'Interaction',
    gameLengthPref: 'Game Length',
    budgetElasticity: 'Budget Flexibility',
  };
  return labels[key];
}

/**
 * Get trait description based on value.
 */
export function getTraitDescription(key: keyof PlaystyleTraits, value: number): string {
  if (key === 'control') {
    if (value < 35) return 'Prefers proactive strategies';
    if (value > 65) return 'Prefers reactive control';
    return 'Balanced approach';
  }
  if (key === 'aggression') {
    if (value < 35) return 'Patient and defensive';
    if (value > 65) return 'Aggressive and fast';
    return 'Tempo-oriented';
  }
  if (key === 'comboAppetite') {
    if (value < 35) return 'Fair magic preferred';
    if (value > 65) return 'Combo-focused';
    return 'Some combo potential';
  }
  if (key === 'varianceTolerance') {
    if (value < 35) return 'Consistency is key';
    if (value > 65) return 'Embraces chaos';
    return 'Moderate variance';
  }
  if (key === 'interactionPref') {
    if (value < 35) return 'Solitaire-style';
    if (value > 65) return 'Highly interactive';
    return 'Balanced interaction';
  }
  if (key === 'gameLengthPref') {
    if (value < 35) return 'Quick games';
    if (value > 65) return 'Long grindy games';
    return 'Medium length';
  }
  if (key === 'budgetElasticity') {
    if (value < 35) return 'Strict budget';
    if (value > 65) return 'No budget concerns';
    return 'Flexible budget';
  }
  return '';
}
