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
