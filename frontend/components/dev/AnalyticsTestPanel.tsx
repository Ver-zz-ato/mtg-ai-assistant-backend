'use client';
// components/dev/AnalyticsTestPanel.tsx
// Development component to test analytics events

import React, { useState } from 'react';
import { trackProGateViewed, trackProGateClicked, trackProUpgradeStarted, trackProFeatureUsed } from '@/lib/analytics-pro';
import { trackDeckCreationWorkflow, trackCollectionImportWorkflow } from '@/lib/analytics-workflow';
import { trackError, trackPerformance } from '@/lib/analytics-performance';
import { trackExperimentAssignment, trackFeatureFlag } from '@/lib/analytics-experiments';
import { capture } from '@/lib/ph';

type TestCategory = 'pro' | 'workflow' | 'performance' | 'error' | 'experiments' | 'all';

interface AnalyticsTestPanelProps {
  isVisible?: boolean;
}

export default function AnalyticsTestPanel({ isVisible = process.env.NODE_ENV === 'development' }: AnalyticsTestPanelProps) {
  const [activeCategory, setActiveCategory] = useState<TestCategory>('pro');
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!isVisible) return null;

  const logEvent = (event: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setEventLog(prev => [`[${timestamp}] ${event}`, ...prev.slice(0, 20)]);
  };

  const testProEvents = {
    viewGate: () => {
      trackProGateViewed('test_feature', 'test_panel');
      logEvent('🔒 PRO Gate Viewed: test_feature at test_panel');
    },
    clickGate: () => {
      trackProGateClicked('test_feature', 'test_panel');
      logEvent('👆 PRO Gate Clicked: test_feature at test_panel');
    },
    startUpgrade: () => {
      trackProUpgradeStarted('gate', { feature: 'test_feature', location: 'test_panel' });
      logEvent('💳 PRO Upgrade Started: from test_panel for test_feature');
    },
    useFeature: () => {
      trackProFeatureUsed('test_feature');
      logEvent('✨ PRO Feature Used: test_feature');
    }
  };

  const testWorkflowEvents = {
    startDeckCreation: () => {
      trackDeckCreationWorkflow('started', { source: 'test_panel' });
      logEvent('🎴 Deck Creation Started: from test_panel');
    },
    completeDeckCreation: () => {
      trackDeckCreationWorkflow('saved', { deck_id: 'test_123', source: 'test_panel' });
      logEvent('✅ Deck Creation Completed: deck_123 from test_panel');
    },
    abandonDeckCreation: () => {
      trackDeckCreationWorkflow('abandoned', { current_step: 2, abandon_reason: 'test_abandonment' });
      logEvent('❌ Deck Creation Abandoned: step 2, reason: test_abandonment');
    },
    startCollectionImport: () => {
      trackCollectionImportWorkflow('started');
      logEvent('📁 Collection Import Started');
    },
    completeCollectionImport: () => {
      trackCollectionImportWorkflow('completed', { cards_added: 50, total_processed: 75 });
      logEvent('✅ Collection Import Completed: 50 added, 75 total');
    }
  };

  const testPerformanceEvents = {
    testApiLatency: () => {
      trackPerformance('performance.api_latency', {
        operation: 'test_api_call',
        duration_ms: 1250,
        api_endpoint: '/api/test',
        cache_hit: false
      });
      logEvent('⚡ API Latency: test_api_call took 1250ms (cache miss)');
    },
    testComponentRender: () => {
      trackPerformance('performance.component_render', {
        operation: 'render',
        duration_ms: 45,
        component: 'TestComponent'
      });
      logEvent('🎨 Component Render: TestComponent took 45ms');
    }
  };

  const testErrorEvents = {
    testApiError: () => {
      trackError('error.api_failure', {
        error_type: 'network',
        error_message: 'Test API failure',
        error_code: 500,
        api_endpoint: '/api/test',
        user_action: 'test_action'
      });
      logEvent('🚨 API Error: 500 error on /api/test during test_action');
    },
    testClientError: () => {
      trackError('error.client_error', {
        error_type: 'validation',
        error_message: 'Test validation error',
        component: 'TestComponent',
        user_action: 'form_submit'
      });
      logEvent('🐛 Client Error: validation error in TestComponent during form_submit');
    }
  };

  const testExperimentEvents = {
    testAssignment: () => {
      trackExperimentAssignment('test_experiment', 'variant_b', 'test_flag');
      logEvent('🧪 Experiment Assignment: test_experiment -> variant_b');
    },
    testFeatureFlag: () => {
      trackFeatureFlag('test_flag', true, { user_segment: 'test' });
      logEvent('🚩 Feature Flag: test_flag enabled for test segment');
    }
  };

  const testAllEvents = {
    runFullTest: () => {
      // Run one event from each category
      testProEvents.viewGate();
      setTimeout(() => testWorkflowEvents.startDeckCreation(), 100);
      setTimeout(() => testPerformanceEvents.testApiLatency(), 200);
      setTimeout(() => testErrorEvents.testClientError(), 300);
      setTimeout(() => testExperimentEvents.testFeatureFlag(), 400);
      
      logEvent('🎯 Full Test Suite: Running all analytics events');
    }
  };

  const categories = {
    pro: { label: '🔒 PRO', tests: testProEvents },
    workflow: { label: '🔄 Workflow', tests: testWorkflowEvents },
    performance: { label: '⚡ Performance', tests: testPerformanceEvents },
    error: { label: '🚨 Error', tests: testErrorEvents },
    experiments: { label: '🧪 Experiments', tests: testExperimentEvents },
    all: { label: '🎯 All', tests: testAllEvents }
  };

  if (!isExpanded) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setIsExpanded(true)}
          className="bg-purple-600 text-white p-3 rounded-full shadow-lg hover:bg-purple-700 transition-colors"
          title="Open Analytics Test Panel"
        >
          📊
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl z-50 text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-neutral-700">
        <h3 className="font-semibold text-purple-300">📊 Analytics Test Panel</h3>
        <button
          onClick={() => setIsExpanded(false)}
          className="text-neutral-400 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-1 p-2 border-b border-neutral-700">
        {Object.entries(categories).map(([key, { label }]) => (
          <button
            key={key}
            onClick={() => setActiveCategory(key as TestCategory)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              activeCategory === key
                ? 'bg-purple-600 text-white'
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Test Buttons */}
      <div className="p-3 space-y-2 max-h-40 overflow-y-auto">
        {Object.entries(categories[activeCategory].tests).map(([testName, testFn]) => (
          <button
            key={testName}
            onClick={testFn}
            className="w-full text-left px-3 py-2 text-sm bg-neutral-800 hover:bg-neutral-700 rounded transition-colors"
          >
            {testName.replace(/([A-Z])/g, ' $1').toLowerCase()}
          </button>
        ))}
      </div>

      {/* Event Log */}
      <div className="border-t border-neutral-700">
        <div className="p-2 bg-neutral-800 text-xs font-semibold text-neutral-300">
          📋 Event Log ({eventLog.length})
          {eventLog.length > 0 && (
            <button
              onClick={() => setEventLog([])}
              className="ml-2 text-red-400 hover:text-red-300"
            >
              Clear
            </button>
          )}
        </div>
        <div className="max-h-32 overflow-y-auto text-xs">
          {eventLog.length === 0 ? (
            <div className="p-2 text-neutral-500 italic">No events logged yet...</div>
          ) : (
            eventLog.map((event, index) => (
              <div
                key={index}
                className="p-2 border-b border-neutral-800 last:border-b-0 font-mono text-neutral-300"
              >
                {event}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-2 bg-neutral-800 text-xs text-neutral-400 rounded-b-lg">
        💡 Open browser DevTools Console to see debug logs
      </div>
    </div>
  );
}
