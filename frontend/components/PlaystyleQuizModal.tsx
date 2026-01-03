'use client';

import { useState, useEffect } from 'react';
import { QUIZ_QUESTIONS, calculateProfile, type QuizQuestion } from '@/lib/quiz/quiz-data';
import { getCommanderSuggestions, getArchetypeSuggestions, getColorIdentitySuggestions } from '@/lib/quiz/commander-suggestions';
import PlaystyleQuizResults from './PlaystyleQuizResults';
import { useCapture } from '@/lib/analytics/useCapture';
import { AnalyticsEvents } from '@/lib/analytics/events';

interface PlaystyleQuizModalProps {
  onClose: () => void;
}

export default function PlaystyleQuizModal({ onClose }: PlaystyleQuizModalProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showResults, setShowResults] = useState(false);
  const capture = useCapture();

  useEffect(() => {
    capture(AnalyticsEvents.QUIZ_STARTED || 'quiz_started', {});
  }, [capture]);

  const currentQuestion = QUIZ_QUESTIONS[currentQuestionIndex];
  const isFirstQuestion = currentQuestionIndex === 0;
  const isLastQuestion = currentQuestionIndex === QUIZ_QUESTIONS.length - 1;
  const progress = ((currentQuestionIndex + 1) / QUIZ_QUESTIONS.length) * 100;

  const handleAnswer = (answerId: string) => {
    const newAnswers = { ...answers, [currentQuestion.id]: answerId };
    setAnswers(newAnswers);

    if (isLastQuestion) {
      // Calculate results
      const profile = calculateProfile(newAnswers);
      const commanders = getCommanderSuggestions(profile);
      const archetypes = getArchetypeSuggestions(profile);
      const colorIdentities = getColorIdentitySuggestions(profile);

      // Store results in localStorage
      try {
        localStorage.setItem('playstyle_quiz_results', JSON.stringify({
          profile,
          commanders,
          archetypes,
          colorIdentities,
          answers: newAnswers,
          completedAt: new Date().toISOString(),
        }));
      } catch {}

      capture(AnalyticsEvents.QUIZ_COMPLETED, {
        profile_label: profile.label,
      });

      setShowResults(true);
    } else {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (!isFirstQuestion) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleRestart = () => {
    setCurrentQuestionIndex(0);
    setAnswers({});
    setShowResults(false);
  };

  if (showResults) {
    const profile = calculateProfile(answers);
    const commanders = getCommanderSuggestions(profile);
    const archetypes = getArchetypeSuggestions(profile);
    const colorIdentities = getColorIdentitySuggestions(profile);

    return (
      <PlaystyleQuizResults
        profile={profile}
        commanders={commanders}
        archetypes={archetypes}
        colorIdentities={colorIdentities}
        onClose={onClose}
        onRestart={handleRestart}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 md:p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Find Your Playstyle</h2>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-white transition-colors"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-sm text-neutral-400 mb-2">
              <span>Question {currentQuestionIndex + 1} of {QUIZ_QUESTIONS.length}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-neutral-800 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-blue-600 to-purple-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Question */}
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-white mb-6">{currentQuestion.text}</h3>
            <div className="space-y-3">
              {currentQuestion.answers.map((answer) => (
                <button
                  key={answer.id}
                  onClick={() => handleAnswer(answer.id)}
                  className="w-full text-left p-4 bg-neutral-900 border border-neutral-700 rounded-xl hover:border-purple-500 hover:bg-neutral-800 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span className="text-neutral-200">{answer.text}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
            <button
              onClick={handleBack}
              disabled={isFirstQuestion}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                isFirstQuestion
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                  : 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700'
              }`}
            >
              ← Back
            </button>
            <button
              onClick={handleRestart}
              className="px-4 py-2 rounded-lg font-medium bg-neutral-800 text-neutral-200 hover:bg-neutral-700 transition-all"
            >
              Restart Quiz
            </button>
            <div className="w-20" /> {/* Spacer for centering */}
          </div>
        </div>
      </div>
    </div>
  );
}
